import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const evolutionSource = fs.readFileSync(new URL('../src/evolution.js', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('AURA Cloud Phase 2 delegates evolution to Quantic Studio when the worker is online', () => {
  assert.match(evolutionSource, /aura-evolution-node-phase2-v1/);
  assert.match(evolutionSource, /await this\.bridge\.workerOnline\(\)/);
  assert.match(evolutionSource, /this\.bridge\.evolve\(objective\)/);
  assert.match(evolutionSource, /phase2-hybrid-local-evolution/);
  assert.match(serverSource, /new EvolutionLab\(ai, kernel, bridge\)/);
  assert.match(serverSource, /evolution\.dispatchCycle\(/);
});

test('manual canary token is not a default evolution blocker', () => {
  assert.match(configSource, /AURA_EVOLUTION_CANARY_REQUIRED', false/);
});
