import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyInitiativeResult } from '../src/outcome_truth.js';

test('completed operator action must include proof of execution', () => {
  assert.deepEqual(
    classifyInitiativeResult('operator', { ok: true, executed: true, result: { changed: 1 } }),
    { status: 'completed', executed: true, waiting_for_worker: false },
  );
});

test('plan-only operation waits for worker rather than claiming success', () => {
  const result = classifyInitiativeResult('operator', {
    ok: true, execution_mode: 'plan-only-fallback', executed: false, plan: 'Proposition, non exécutée',
  });
  assert.equal(result.status, 'waiting');
  assert.equal(result.executed, false);
  assert.equal(result.waiting_for_worker, true);
});

test('queued operator result cannot complete a mission', () => {
  assert.equal(classifyInitiativeResult('operator', { ok: true, queued: true }).status, 'waiting');
});

test('successful verified research result is completed', () => {
  assert.equal(classifyInitiativeResult('research', { ok: true, evidence: ['source'] }).status, 'completed');
});

test('missing result never counts as success', () => {
  assert.equal(classifyInitiativeResult('research', {}).status, 'failed');
  assert.equal(classifyInitiativeResult('reflection', null).status, 'failed');
});

test('returned failures are failed, not completed', () => {
  assert.equal(classifyInitiativeResult('research', { ok: false, reason: 'offline' }).status, 'failed');
  assert.equal(classifyInitiativeResult('evolution', { status: 'no-safe-patch' }).status, 'failed');
  assert.equal(classifyInitiativeResult('research', { status: 'completed', result: { status: 'failed' } }).status, 'failed');
  assert.equal(classifyInitiativeResult('worker', { status: 'completed', result: { ok: false } }).status, 'failed');
});

test('remote waiting and rejected statuses do not count as success', () => {
  assert.equal(classifyInitiativeResult('evolution', { status: 'waiting-local-worker' }).status, 'waiting');
  assert.equal(classifyInitiativeResult('worker', { status: 'security-rejected' }).status, 'failed');
});

test('completed worker jobs still require a nonempty outcome', () => {
  assert.equal(classifyInitiativeResult('worker', { ok: true, artifact: 'result.json' }).status, 'completed');
  assert.equal(classifyInitiativeResult('worker', {}).status, 'failed');
});

test('explicit failures outrank waiting/plan-only markers', () => {
  assert.equal(classifyInitiativeResult('operator', {
    status: 'failed', ok: false, executed: false,
  }).status, 'failed');
  assert.equal(classifyInitiativeResult('worker', {
    status: 'queued', result: { ok: false },
  }).status, 'failed');
});

test('a completed transport job that only planned is not completed work', () => {
  assert.equal(classifyInitiativeResult('worker', {
    ok: true, executed: false, plan: 'Non exécuté',
  }).status, 'failed');
});
