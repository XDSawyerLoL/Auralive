import test from 'node:test';
import assert from 'node:assert/strict';

import { AuraCloudWorkspace } from '../src/cloud_workspace.js';
import { CapabilityFabric } from '../src/capability_fabric.js';
import { CognitiveKernel } from '../src/kernel.js';
import { DagCompiler, TaskGraphExecutor } from '../src/task_graph.js';

test('native DAG compiler composes unfamiliar evidence and transform capabilities', async () => {
  const compiler = new DagCompiler({ enabled: false });
  const graph = await compiler.compile(
    'Stabiliser un registre Zephyr inconnu, vérifier son état puis produire une transformation réversible.',
    [
      { id: 'probe.evidence', name: 'Probe Evidence', tags: ['research', 'evidence'], trust: 0.9 },
      { id: 'zephyr.transform', name: 'Zephyr Transform', tags: ['transform'], trust: 0.8 },
    ],
  );

  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.nodes[0].capability, 'probe.evidence');
  assert.equal(graph.nodes[1].capability, 'zephyr.transform');
  assert.deepEqual(graph.nodes[1].depends_on, [graph.nodes[0].id]);
});

test('cloud workspace blocks path traversal', () => {
  const workspace = new AuraCloudWorkspace();
  assert.throws(() => workspace.safePath('../outside.txt'), /workspace interdite|invalide/i);
  assert.throws(() => workspace.safePath('/tmp/outside.txt'), /workspace invalide/i);
});

test('typed cloud workspace side effects fail closed unless explicitly authorized', async () => {
  const fabric = new CapabilityFabric();
  const compiler = new DagCompiler({ enabled: false });
  const graph = await compiler.compile(
    'Créer un fichier de test, relire son contenu, puis le supprimer.',
    fabric.list().filter((item) => item.provider === 'aura-cloud-workspace'),
  );
  const executor = new TaskGraphExecutor(fabric);
  const refused = await executor.execute(graph);
  assert.equal(refused.ok, false);
  assert.match(refused.errors[0]?.error || '', /interdite|indisponible/i);
});

test('typed cloud workspace executes and verifies a reversible file roundtrip', async () => {
  const fabric = new CapabilityFabric();
  const compiler = new DagCompiler({ enabled: false });
  const graph = await compiler.compile(
    'Créer un fichier de test, relire son contenu, puis le supprimer.',
    fabric.list().filter((item) => item.provider === 'aura-cloud-workspace'),
  );
  const executor = new TaskGraphExecutor(fabric);
  const outcome = await executor.execute(graph, { allowSideEffects: true });

  assert.equal(outcome.ok, true);
  const rows = Object.values(outcome.results);
  const created = rows.find((row) => row.capability === 'cloud.workspace.create')?.result;
  const read = rows.find((row) => row.capability === 'cloud.workspace.read')?.result;
  const deleted = rows.find((row) => row.capability === 'cloud.workspace.delete')?.result;
  assert.equal(created?.created, true);
  assert.equal(read?.read, true);
  assert.equal(created?.sha256, read?.sha256);
  assert.equal(deleted?.deleted, true);
  assert.equal(deleted?.exists_after, false);
});

test('cloud kernel executes typed sandbox mission when Quantic Studio is offline', async () => {
  const fabric = new CapabilityFabric();
  const kernel = new CognitiveKernel(
    { enabled: false, async generate() { return ''; } },
    null,
    { enabled: false, async workerOnline() { return false; } },
    null,
    fabric,
  );
  kernel.trace = async () => {};
  kernel.runAgent = async () => ({ agent: 'operator', answer: 'fallback' });

  const outcome = await kernel.operate(
    'Créer un fichier de test, relire son contenu, puis le supprimer.',
    ['safe'],
  );
  assert.equal(outcome.executed, true);
  assert.equal(outcome.execution_mode, 'aura-cloud-sandbox');
  assert.equal(outcome.authority, 'typed-reversible-cloud-workspace');
});

test('swarm dispatches independent agents concurrently before synthesis', async () => {
  const kernel = new CognitiveKernel(
    { enabled: true, async generate() { return 'synthesis'; } },
    null,
    null,
  );
  kernel.trace = async () => {};
  let active = 0;
  let maxActive = 0;
  kernel.runAgent = async (name) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    return { agent: name, answer: name };
  };

  const result = await kernel.swarm('parallel mission', ['planner', 'research', 'dev', 'critic']);
  assert.equal(result.concurrent, true);
  assert.ok(maxActive >= 2);
  assert.deepEqual(result.agents.map((item) => item.agent), ['planner', 'research', 'dev', 'critic']);
});


test('failed capability result cannot be silently completed by DAG executor', async () => {
  const fabric = {
    async execute() { return { ok: false, error: 'write refused' }; },
  };
  const executor = new TaskGraphExecutor(fabric);
  const graph = { id: 'failed-action', objective: 'Test refusal',
    nodes: [{ id: 'attempt', capability: 'cloud.workspace.create',
      depends_on: [], verification: 'side-effect' }] };
  const result = await executor.execute(graph, { allowSideEffects: true });
  assert.equal(result.ok, false);
  assert.equal(result.metrics.nodes_completed, 0);
  assert.match(result.errors[0]?.error || '', /write refused/);
});

test('cloud sandbox produces cryptographically consistent proof before reporting executed', async () => {
  const fabric = new CapabilityFabric();
  const kernel = new CognitiveKernel({ enabled: false, async generate() { return ''; } },
    null, { enabled: false, async workerOnline() { return false; } }, null, fabric);
  kernel.trace = async () => {};
  kernel.runAgent = async () => ({ agent: 'operator', answer: 'safe plan' });
  const result = await kernel.operate('Créer un fichier de test, relire son contenu, puis le supprimer.', ['safe']);
  assert.equal(result.executed, true);
  assert.equal(result.verification?.verified, true);
  assert.equal(result.verification?.kind, 'workspace-create-read-sha256-delete');
  assert.match(result.verification?.sha256 || '', /^[a-f0-9]{64}$/);
  assert.equal(result.verification?.deleted, true);
});

test('unrelated real-world repair is not replaced with an irrelevant sandbox write', async () => {
  const fabric = new CapabilityFabric();
  const kernel = new CognitiveKernel({ enabled: false, async generate() { return ''; } },
    null, { enabled: false, async workerOnline() { return false; } }, null, fabric);
  kernel.trace = async () => {};
  kernel.runAgent = async () => ({ agent: 'operator', answer: 'Action impossible sans connecteur.' });
  const result = await kernel.operate('Réparer la panne du lecteur vidéo SWAPP.', []);
  assert.equal(result.executed, false);
  assert.equal(result.execution_mode, 'plan-only-fallback');
});


test('failed cloud workspace verification is surfaced as a failed action', async () => {
  const fabric = new CapabilityFabric();
  const registered = fabric.handlers.get('cloud.workspace.read');
  assert.equal(typeof registered, 'function');
  fabric.handlers.set('cloud.workspace.read', async (input) => {
    const output = await registered(input);
    return { ...output, result: { ...output.result, sha256: '0'.repeat(64) } };
  });
  const kernel = new CognitiveKernel({ enabled: false, async generate() { return ''; } },
    null, { enabled: false, async workerOnline() { return false; } }, null, fabric);
  kernel.trace = async () => {};
  kernel.runAgent = async () => ({ agent: 'operator', answer: 'plan-only' });
  const result = await kernel.operate('Créer un fichier de test, relire son contenu, puis le supprimer.', ['safe']);
  assert.equal(result.ok, false);
  assert.equal(result.executed, false);
  assert.equal(result.execution_mode, 'aura-cloud-sandbox-verification-failed');
  assert.equal(result.verification?.verified, false);
});
