import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReadiness } from '../scripts/audit-aura-readiness.mjs';

test('production-like snapshot distinguishes running kernel from unavailable execution', () => {
  const result = evaluateReadiness({
    health: { ready: true, db: true, build: { provenance_verified: false } },
    kernel: { started: true, expression: { natural_french_ready: false }, reflex_evidence: { machine_verified: 0 } },
    caps: { memory: { ready: true }, language: { ready: false }, web_substrate: { enabled: true, total_research: 80 }, hands: { ready: false } },
    command: { local_worker_online: false, long_horizon: { counts: { completed: 0, active: 1 } } },
    ai: { zero_cost_mode: true },
  });
  assert.equal(result.capabilities.noyau.state, 'disponible');
  assert.equal(result.capabilities.memoire.state, 'disponible');
  assert.equal(result.capabilities.francais.state, 'indisponible');
  assert.equal(result.capabilities.actions_machine.state, 'indisponible');
  assert.equal(result.capabilities.agents.state, 'non-prouve');
  assert.equal(result.capabilities.missions.state, 'non-prouve');
  assert.equal(result.capabilities.verification.state, 'non-prouve');
  assert.equal(result.capabilities.recherche.observed_sessions, 80);
  assert.equal(result.production_build_verified, false);
  assert.equal(result.zero_cost_mode_reported, true);
});
test('run counts and proof signals are never silently invented', () => {
  const result = evaluateReadiness({
    health: { ready: true, db: true },
    kernel: { started: true, agent_runs: { counts: { planner: { completed: 2 }, critic: { completed: 1 } } }, reflex_evidence: { machine_verified: 2 } },
    caps: { hands: { ready: true }, language: { ready: true } },
    command: { local_worker_online: true, long_horizon: { counts: { completed: 2, active: 0 } } },
  });
  assert.equal(result.capabilities.agents.recorded_runs, 3);
  assert.equal(result.capabilities.missions.completed, 2);
  assert.equal(result.capabilities.verification.machine_verified, 2);
  assert.equal(result.capabilities.actions_machine.state, 'disponible');
  assert.equal(result.capabilities.francais.state, 'indisponible');
});
