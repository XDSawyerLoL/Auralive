import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const evolutionSource = fs.readFileSync(new URL('../src/evolution.js', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const bridgeSource = fs.readFileSync(new URL('../src/bridge.js', import.meta.url), 'utf8');
const runtimeWorkerUrl = new URL('../../aura_runtime/worker.py', import.meta.url);
const runtimeWorkerSource = fs.existsSync(runtimeWorkerUrl) ? fs.readFileSync(runtimeWorkerUrl, 'utf8') : '';
const studioAdapterUrl = new URL('../../app/services/aura_cloud_worker.py', import.meta.url);
const studioAdapterSource = fs.existsSync(studioAdapterUrl) ? fs.readFileSync(studioAdapterUrl, 'utf8') : '';

test('AURA Cloud Phase 3 delegates evolution to AURA Runtime when the worker is online', () => {
  assert.match(evolutionSource, /aura-evolution-node-phase3-v1/);
  assert.match(evolutionSource, /await this\.bridge\.workerOnline\(\)/);
  assert.match(evolutionSource, /this\.bridge\.evolve\(objective, \{/);
  assert.match(evolutionSource, /phase3-hybrid-autonomous-evolution/);
  assert.match(evolutionSource, /phase3-cloud-persistent-adaptation/);
  assert.match(evolutionSource, /persistent-runtime-learning/);
  assert.match(evolutionSource, /aura_improvement_proposals/);
  assert.match(serverSource, /new EvolutionLab\(ai, kernel, bridge\)/);
  assert.match(serverSource, /evolution\.dispatchCycle\(/);
});

test('Fleet worker respects the configured auto-submit switch after Runtime extraction', { skip: !runtimeWorkerSource }, () => {
  assert.match(runtimeWorkerSource, /submit=bool\(evolution\.auto_submit\)/);
  assert.match(runtimeWorkerSource, /self\.fleet_factory/);
  assert.match(studioAdapterSource, /fleet_factory=EvolutionFleet/);
});

test('AURA Cloud routes targeted repositories through Evolution Fleet only when AURA Runtime is online', () => {
  assert.match(evolutionSource, /delegated-evolution-fleet/);
  assert.match(evolutionSource, /Evolution Fleet exige AURA Runtime en ligne/);
  assert.match(serverSource, /repository:\s*String\(request\.body\?\.repository/);
});

test('Evolution bridge exposes the queued worker job id for Command Center reconciliation', () => {
  assert.match(bridgeSource, /job_id:\s*job\.id/);
  assert.match(bridgeSource, /repository,/);
});

test('automatic canary is required without a manual token gate', () => {
  assert.match(configSource, /AURA_EVOLUTION_CANARY_REQUIRED', true/);
  assert.match(configSource, /AURA_EVOLUTION_CANARY_MODE \|\| 'automatic'/);
  assert.match(configSource, /evolutionCanaryMode === 'manual'/);
});
