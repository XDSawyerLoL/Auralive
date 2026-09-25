import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const evolutionSource = fs.readFileSync(new URL('../src/evolution.js', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('AURA Cloud Phase 3 delegates evolution to Quantic Studio when the worker is online', () => {
  assert.match(evolutionSource, /aura-evolution-node-phase3-v1/);
  assert.match(evolutionSource, /await this\.bridge\.workerOnline\(\)/);
  assert.match(evolutionSource, /this\.bridge\.evolve\(objective\)/);
  assert.match(evolutionSource, /phase3-hybrid-autonomous-evolution/);
  assert.match(evolutionSource, /phase3-cloud-persistent-adaptation/);
  assert.match(evolutionSource, /persistent-runtime-learning/);
  assert.match(evolutionSource, /aura_improvement_proposals/);
  assert.match(serverSource, /new EvolutionLab\(ai, kernel, bridge\)/);
  assert.match(serverSource, /evolution\.dispatchCycle\(/);
});

test('automatic canary is required without a manual token gate', () => {
  assert.match(configSource, /AURA_EVOLUTION_CANARY_REQUIRED', true/);
  assert.match(configSource, /AURA_EVOLUTION_CANARY_MODE \|\| 'automatic'/);
  assert.match(configSource, /evolutionCanaryMode === 'manual'/);
});
