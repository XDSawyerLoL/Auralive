import test from 'node:test';
import assert from 'node:assert/strict';
import { planResearchBudget, VerifiedResearchLab } from '../src/verified_research_lab.js';

test('classical budget planner finds the exact feasible optimum', () => {
  const tasks = [
    { id: 'language', costUnits: 2, expectedValue: 6 },
    { id: 'verification', costUnits: 3, expectedValue: 8 },
    { id: 'exploration', costUnits: 4, expectedValue: 9 },
    { id: 'memory', costUnits: 2, expectedValue: 5 },
  ];
  const a = planResearchBudget(tasks, 5);
  const b = planResearchBudget([...tasks].reverse(), 5);
  assert.deepEqual(a.selected, ['language', 'verification']);
  assert.equal(a.totalExpectedValue, 14);
  assert.equal(a.totalCostUnits, 5);
  assert.deepEqual(a, b);
});

test('budget planner fails closed on invalid or duplicate inputs', () => {
  assert.throws(() => planResearchBudget([], -1), /budget/);
  assert.throws(() => planResearchBudget([], 3000), /budget/);
  assert.throws(() => planResearchBudget([
    { id: 'repeat', costUnits: 1, expectedValue: 1 },
    { id: 'repeat', costUnits: 1, expectedValue: 2 },
  ], 2), /duplicate/);
  assert.throws(() => planResearchBudget([
    { id: 'invalid', costUnits: -1, expectedValue: 2 },
  ], 2), /costUnits/);
});

test('experiments are blocked by default when side effects are not approved', async () => {
  const lab = new VerifiedResearchLab({ budgetUnits: 2 });
  let executions = 0;
  const task = {
    id: 'write', costUnits: 1, expectedValue: 1, sideEffects: true,
    execute: async () => { executions += 1; return true; },
    verify: async () => ({ ok: true, verifierId: 'external', evidenceId: 'test-1' }),
  };
  const blocked = await lab.run({ objective: 'safety', candidates: [task] });
  assert.equal(executions, 0);
  assert.equal(blocked.blocked[0].reason, 'side-effects-not-approved');
  const approved = await lab.run({
    objective: 'safety', candidates: [task], approvedSideEffects: ['write'],
  });
  assert.equal(executions, 1);
  assert.equal(approved.results[0].status, 'pass');
});

test('verification contract is required before learning from an outcome', async () => {
  const lab = new VerifiedResearchLab({ budgetUnits: 1 });
  const noEvidence = {
    id: 'a', costUnits: 1, expectedValue: 2,
    execute: async () => ({ answer: 'invented secret' }),
    verify: async () => ({ ok: true }),
  };
  const output = await lab.run({ objective: 'private objective', candidates: [noEvidence] });
  assert.equal(output.results[0].status, 'unverified');
  assert.equal(lab.historicalRate('a'), 0.5);
  assert.doesNotMatch(JSON.stringify(lab.snapshot()), /private objective|invented secret/);
  assert.match(lab.snapshot().records[0].objectiveHash, /^[0-9a-f]{64}$/);
});

test('only externally declared verified results change selection, no AGI claim', async () => {
  const lab = new VerifiedResearchLab({ budgetUnits: 1 });
  const candidate = (id, ok) => ({
    id, costUnits: 1, expectedValue: 2,
    execute: async () => 'candidate output',
    verify: async () => ({ ok, verifierId: 'independent-test-runner', evidenceId: id + '-test' }),
  });
  const first = await lab.run({
    objective: 'benchmark',
    candidates: [candidate('a', false), candidate('b', true)],
  });
  assert.deepEqual(first.plan.selected, ['a']);
  assert.equal(first.results[0].status, 'fail');
  assert.equal(lab.historicalRate('a'), 1 / 3);
  const second = await lab.run({
    objective: 'benchmark',
    candidates: [candidate('a', false), candidate('b', true)],
  });
  assert.deepEqual(second.plan.selected, ['b']);
  assert.equal(second.results[0].status, 'pass');
  assert.equal(second.claim, 'bounded-experiment-orchestration-only-not-general-learning');
});

test('a crashed experiment is recorded as error without affecting learned rate', async () => {
  const lab = new VerifiedResearchLab({ budgetUnits: 1 });
  const result = await lab.run({
    objective: 'diagnosis',
    candidates: [{
      id: 'broken', costUnits: 1, expectedValue: 1,
      execute: async () => { throw new Error('sensitive stack trace'); },
      verify: async () => ({ ok: true, verifierId: 'outside', evidenceId: 'failure-log' }),
    }],
  });
  assert.equal(result.results[0].status, 'error');
  assert.equal(lab.historicalRate('broken'), 0.5);
  assert.doesNotMatch(JSON.stringify(lab.snapshot()), /sensitive stack trace/);
});

test('zero budget never selects positive-cost experiments', async () => {
  const lab = new VerifiedResearchLab({ budgetUnits: 0 });
  const r = await lab.run({ objective: 'zero-cost', candidates: [
    { id: 'paid', costUnits: 1, expectedValue: 100, execute: async () => 1,
      verify: async () => ({ ok: true, verifierId: 'test', evidenceId: 'zero' }) },
  ] });
  assert.deepEqual(r.plan.selected, []);
  assert.deepEqual(r.results, []);
});
