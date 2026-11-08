import test from 'node:test';
import assert from 'node:assert/strict';
import { CognitiveTraceLedger } from '../src/cognitive_trace.js';

test('trace session isolation, including explicit run identifiers', () => {
  const ledger = new CognitiveTraceLedger();
  const id = ledger.start('session-a');
  ledger.mark(id, 'decision', 'done', { decision_act: 'respond' });
  assert.equal(ledger.snapshot('session-a', id).available, true);
  assert.equal(ledger.snapshot('session-b', id).available, false);
  assert.equal(ledger.snapshot('session-b').events.length, 0);
});

test('trace excludes arbitrary or sensitive details', () => {
  const ledger = new CognitiveTraceLedger();
  const id = ledger.start('session');
  ledger.mark(id, 'context', 'done', {
    messages: 8, secret: 'a secret token', prompt: 'medical notes', answer: 'private answer',
    memory_items: 3, decision_act: 'respond;DROP TABLE',
  });
  const entry = ledger.snapshot('session', id).events.at(-1);
  assert.deepEqual(entry.details, { messages: 8, memory_items: 3, decision_act: 'other' });
  assert.doesNotMatch(JSON.stringify(ledger.snapshot('session')), /secret|medical notes|private answer/);
});

test('trace only accepts known stages and states, never fabricated ones', () => {
  const ledger = new CognitiveTraceLedger();
  const id = ledger.start('session');
  assert.equal(ledger.mark(id, 'imaginary_neuron', 'done'), false);
  assert.equal(ledger.mark(id, 'memory', 'hallucinating'), false);
  assert.equal(ledger.snapshot('session').events.length, 1);
  assert.equal(ledger.mark(id, 'context', 'running'), true);
  assert.equal(ledger.mark(id, 'context', 'done', { messages: 2 }), true);
  ledger.finish(id);
  assert.equal(ledger.mark(id, 'expression', 'done'), false);
  assert.equal(ledger.snapshot('session').state, 'done');
});

test('trace failures are explicit and no fake success is emitted', () => {
  let stamp = 1_800_000_000_000;
  const ledger = new CognitiveTraceLedger({ clock: () => stamp });
  const id = ledger.start('session');
  stamp += 126;
  ledger.mark(id, 'semantic', 'running');
  stamp += 305;
  ledger.finish(id, 'error');
  const run = ledger.snapshot('session', id);
  assert.equal(run.state, 'error');
  assert.equal(run.duration_ms, 431);
  assert.equal(run.events.at(-1).status, 'error');
  assert.equal(run.events.at(-1).stage, 'request');
});

test('bounded retention and chronological expiration', () => {
  let stamp = 1_800_000_000_000;
  const ledger = new CognitiveTraceLedger({ clock: () => stamp });
  const expired = ledger.start('old');
  stamp += 20 * 60_000 + 1;
  ledger.start('new');
  assert.equal(ledger.snapshot('old', expired).available, false);
  assert.equal(ledger.snapshot('new').available, true);
  for (let i = 0; i < 150; i++) ledger.start('bulk');
  assert.ok(ledger.runs.size <= 120);
});
