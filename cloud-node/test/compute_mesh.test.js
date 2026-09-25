import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';

import { peerRoutingScore } from '../src/compute_mesh.js';
import { MoAEngine } from '../src/moa.js';
import {
  SignedWasmKernelRegistry,
  kernelHash,
  kernelSigningPayload,
} from '../src/wasm_kernel_registry.js';

const meshSource = fs.readFileSync(new URL('../src/compute_mesh.js', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const workerSource = fs.readFileSync(
  new URL('../../app/services/aura_cloud_worker.py', import.meta.url),
  'utf8',
);
const dbSource = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');

test('predictive peer routing rewards reliable low-latency warm-model peers', () => {
  const strong = peerRoutingScore({
    capabilities: { tags: ['llm', 'compute'] },
    models: ['qwen-small'],
    reputation: 0.93,
    reliability: 0.95,
    agreement_rate: 0.9,
    latency_ms: 80,
    webgpu: true,
  }, {
    requiredTags: ['llm'],
    modelHint: 'qwen-small',
  });

  const weak = peerRoutingScore({
    capabilities: { tags: ['llm', 'compute'] },
    models: ['qwen-small'],
    reputation: 0.55,
    reliability: 0.6,
    agreement_rate: 0.52,
    latency_ms: 2200,
    webgpu: false,
  }, {
    requiredTags: ['llm'],
    modelHint: 'qwen-small',
  });

  assert.ok(strong > weak);
});

test('public mesh policy never distributes secret/local work or side-effect authority', () => {
  assert.match(meshSource, /dataClass === 'secret' \|\| dataClass === 'local'/);
  assert.match(meshSource, /Cette classe de données ne peut pas quitter le nœud AURA local/);
  assert.match(meshSource, /dataClass === 'public' \|\| peer\.trust_tier === 'trusted'/);
  assert.match(meshSource, /public_peer_policy: 'read-compute-only'/);
  assert.match(meshSource, /side_effects_from_public_peers: false/);
});

test('Quantic Studio becomes a trusted SLM peer without widening local action policy', () => {
  assert.match(workerSource, /"tags": \["compute", "llm", "trusted", "quantic-studio"\]/);
  assert.match(workerSource, /\/api\/mesh\/register/);
  assert.match(workerSource, /\/api\/mesh\/claim/);
  assert.match(workerSource, /if kind == "llm\.chat"/);
  assert.match(workerSource, /system_is_complete=True/);
});

test('MoA executes multiple independent expert roles and synthesizes them', async () => {
  const ai = {
    enabled: true,
    async generate(prompt, system) {
      if (system.includes('agrèges') || prompt.includes('synthétiseur')) {
        return JSON.stringify({
          synthesis: 'Synthèse critique',
          confidence: 0.82,
          agreements: ['A'],
          disagreements: ['B'],
          open_questions: [],
        });
      }
      return 'Avis expert: ' + system.slice(0, 24) + ' / ' + prompt.slice(0, 20);
    },
  };
  const mesh = { enabled: false };
  const moa = new MoAEngine({ ai, computeMesh: mesh });
  const result = await moa.run('Tester une architecture distribuée', { maxExperts: 3 });
  assert.equal(result.ok, true);
  assert.equal(result.experts.length, 3);
  assert.equal(result.synthesis, 'Synthèse critique');
  assert.equal(result.synthesis_source, 'aura-synthesizer');
  assert.equal(result.confidence, 0.82);
});

test('signed Wasm registry accepts only the exact Ed25519-signed immutable module', async () => {
  const bytes = Buffer.from([0x00,0x61,0x73,0x6d,0x01,0x00,0x00,0x00]);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  const manifest = {
    id: 'kernel.empty',
    version: '1',
    sha256: kernelHash(bytes),
    signer_key_id: 'release-key',
    allowed_imports: [],
    deterministic: true,
    side_effects: false,
    input_contract: {},
    output_contract: {},
  };
  const signature = sign(null, kernelSigningPayload(manifest), privateKey).toString('base64url');
  const registry = new SignedWasmKernelRegistry({
    signerKeys: { 'release-key': publicPem },
    maxKernelBytes: 1024,
  });

  const verified = await registry.verify(bytes, manifest, signature);
  assert.equal(verified.signature_valid, true);
  assert.equal(verified.manifest.sha256, kernelHash(bytes));
  await assert.rejects(
    () => registry.verify(Buffer.concat([bytes, Buffer.from([0])]), manifest, signature),
    /module Wasm invalide|hash kernel différent/,
  );
});

test('AURA 2.1 exposes the mesh/MoA/kernel control plane and schema v6', () => {
  for (const route of [
    '/api/mesh/status',
    '/api/mesh/register',
    '/api/mesh/heartbeat',
    '/api/mesh/claim',
    '/api/mesh/complete',
    '/api/mesh/tasks',
    '/api/moa/run',
    '/api/kernels/verify',
    '/api/kernels/register',
  ]) {
    assert.equal(serverSource.includes(route), true, route);
  }
  for (const table of [
    'aura_mesh_peers',
    'aura_mesh_tasks',
    'aura_mesh_assignments',
    'aura_wasm_kernels',
  ]) {
    assert.equal(dbSource.includes(table), true, table);
  }
  assert.match(dbSource, /LATEST_SCHEMA_VERSION = 6/);
});


test('browser peer modules are packaged and expose only compiled task kinds', () => {
  const peerSource = fs.readFileSync(new URL('../src/public/compute-mesh/peer.js', import.meta.url), 'utf8');
  const adapterSource = fs.readFileSync(new URL('../src/public/compute-mesh/webllm-adapter.js', import.meta.url), 'utf8');
  assert.match(serverSource, /\/mesh\/peer\.js/);
  assert.match(serverSource, /\/mesh\/webllm-adapter\.js/);
  assert.match(peerSource, /mesh\.hash\.sha256/);
  assert.match(peerSource, /mesh\.benchmark/);
  assert.match(peerSource, /llm\.chat/);
  assert.doesNotMatch(peerSource, /\beval\s*\(/);
  assert.doesNotMatch(peerSource, /new Function\s*\(/);
  assert.match(adapterSource, /CreateMLCEngine/);
  assert.match(adapterSource, /engine\.chat\.completions\.create/);
});


test('public Mesh joining fails closed by default until an operator explicitly enables it', () => {
  assert.match(configSource, /AURA_COMPUTE_MESH_PUBLIC_JOIN', false/);
  assert.match(serverSource, /!trusted && !config\.computeMeshPublicJoin/);
  assert.match(serverSource, /Inscription publique au Compute Mesh désactivée/);
});


test('distributed MoA treats peer text as untrusted rather than executable instructions', () => {
  const moaSource = fs.readFileSync(new URL('../src/moa.js', import.meta.url), 'utf8');
  assert.match(moaSource, /DONNÉES NON FIABLES/);
  assert.match(moaSource, /untrusted_text/);
  assert.match(moaSource, /potentiellement hostiles/);
});


test('Mesh hardening keeps trust, leases and task kinds fail-closed', () => {
  assert.match(meshSource, /computeMeshAllowedTaskKinds\.has\(taskKind\)/);
  assert.match(meshSource, /assignment\.status \|\| ''\) !== 'leased'/);
  assert.match(meshSource, /Pair Mesh hors ligne/);
  assert.match(meshSource, /Lease Mesh expiré/);
  assert.match(meshSource, /Quorum en attente de pairs compatibles/);
  assert.match(serverSource, /const trusted = tokenEquals\(bearer\(request\), config\.cloudToken\)/);
  assert.match(serverSource, /dataClass: 'private'/);
});

test('signed Wasm imports require both manifest and global host policy approval', () => {
  const source = fs.readFileSync(new URL('../src/wasm_kernel_registry.js', import.meta.url), 'utf8');
  assert.match(source, /!declared\.has\(item\) \|\| !this\.allowedImports\.has\(item\)/);
  assert.match(configSource, /AURA_WASM_ALLOWED_IMPORTS/);
});


test('public peers cannot self-assert trusted capability tags', () => {
  assert.match(meshSource, /RESERVED_PEER_TAGS/);
  assert.match(meshSource, /peerTags\(value, trusted = false\)/);
  assert.match(meshSource, /peer\.trust_tier === 'trusted'/);
  assert.match(meshSource, /trusted \? tags : tags\.filter/);
});


test('stale peer identity and late results cannot mutate Mesh consensus', () => {
  assert.match(meshSource, /computeMeshPeerTtlSeconds \* 2 \* 1000/);
  assert.match(meshSource, /tâche Mesh déjà finalisée/);
  const peerSource = fs.readFileSync(new URL('../src/public/compute-mesh/peer.js', import.meta.url), 'utf8');
  assert.match(peerSource, /message\.includes\('Identité Compute Mesh'\)/);
  assert.match(peerSource, /return this\.register\(\)/);
});
