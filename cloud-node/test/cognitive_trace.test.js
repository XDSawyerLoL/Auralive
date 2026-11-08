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

test('autonomous cycle is founder-only and cannot be fetched through a visitor session', () => {
  let timestamp = 1_800_000_000_000;
  const ledger = new CognitiveTraceLedger({ clock: () => timestamp });
  const id = ledger.startAutonomy('ambient');
  timestamp += 45;
  ledger.mark(id, 'regulation', 'done', { delta_stability: -0.003 });
  ledger.finish(id);
  assert.equal(ledger.snapshot('public-cookie-session', id).available, false);
  assert.equal(ledger.snapshotAutonomy(id).available, true);
  assert.equal(ledger.snapshotAutonomy(id).kind, 'autonomy');
  assert.equal(ledger.snapshotAutonomy(id).events.at(-1).stage, 'cycle');
  assert.equal(ledger.snapshotAutonomy(id).events[0].details.trigger_kind, 'ambient');
});

test('stage duration uses measured start and completion, not animation time', () => {
  let timestamp = 1_800_000_000_000;
  const ledger = new CognitiveTraceLedger({ clock: () => timestamp });
  const id = ledger.start('one');
  timestamp += 25;
  ledger.mark(id, 'context', 'running');
  timestamp += 310;
  ledger.mark(id, 'context', 'done', { messages: 3 });
  const completed = ledger.snapshot('one', id).events.at(-1);
  assert.equal(completed.elapsed_ms, 335);
  assert.equal(completed.duration_ms, 310);
  ledger.finish(id);
  assert.equal(ledger.snapshot('one', id).duration_ms, 335);
});

test('agent failure, blocked state and confirmed operator execution stay distinct', () => {
  const ledger = new CognitiveTraceLedger();
  const failId = ledger.recordOperation('agent', false, 'failed');
  const blockedId = ledger.recordOperation('agent', false, 'blocked');
  const actionId = ledger.recordOperation('operator', true);
  const refusedId = ledger.recordOperation('operator', false);
  assert.equal(ledger.snapshotAutonomy(failId).state, 'error');
  assert.equal(ledger.snapshotAutonomy(failId).events.find(e => e.stage === 'reflection_auto').status, 'error');
  assert.equal(ledger.snapshotAutonomy(blockedId).events.find(e => e.stage === 'reflection_auto').status, 'skipped');
  assert.equal(ledger.snapshotAutonomy(actionId).events.find(e => e.stage === 'execution_auto').details.execution_confirmed, true);
  assert.equal(ledger.snapshotAutonomy(refusedId).events.find(e => e.stage === 'execution_auto').status, 'skipped');
  assert.equal(ledger.recordOperation('unknown', true), '');
});

test('autonomous trace redacts arbitrary trigger strings and never contains mission text', () => {
  const ledger = new CognitiveTraceLedger();
  const id = ledger.startAutonomy('contact private.person@example.com');
  ledger.mark(id, 'context_auto', 'done', { stimuli_count: 4, raw_prompt: 'PRIVATE SECRET', memory: 'internal' });
  ledger.finish(id);
  const data = JSON.stringify(ledger.snapshotAutonomy(id));
  assert.doesNotMatch(data, /private.person|PRIVATE SECRET|internal/);
  assert.equal(ledger.snapshotAutonomy(id).events.at(-2).details.stimuli_count, 4);
});

test('homeostasis values are sourced, bounded, and never accept arbitrary identity strings', () => {
  const ledger = new CognitiveTraceLedger();
  const id = ledger.start('safe');
  ledger.mark(id, 'homeostasis', 'done', {
    state_stability: 0.72345, state_curiosity: 2.5,
    state_frustration: -0.4, state_mood: 'curieuse',
    thought: 'private chain of thought', state_personal_name: 'secret',
  });
  const details = ledger.snapshot('safe', id).events.at(-1).details;
  assert.equal(details.state_stability, 0.723);
  assert.equal(details.state_curiosity, 1);
  assert.equal(details.state_frustration, 0);
  assert.equal(details.state_mood, 'curieuse');
  assert.equal(Object.hasOwn(details, 'thought'), false);
  assert.equal(Object.hasOwn(details, 'state_personal_name'), false);
});

test('unverified agent executions never appear as confirmed external actions', () => {
  const ledger = new CognitiveTraceLedger();
  const success = ledger.recordOperation('agent', false, 'completed');
  const swarm = ledger.recordOperation('swarm', false);
  const successEvents = ledger.snapshotAutonomy(success).events;
  assert.equal(successEvents.find(e => e.stage === 'reflection_auto').status, 'done');
  assert.equal(successEvents.find(e => e.stage === 'execution_auto').status, 'skipped');
  assert.equal(successEvents.find(e => e.stage === 'execution_auto').details.execution_confirmed, false);
  assert.equal(ledger.snapshotAutonomy(swarm).events.find(e => e.stage === 'execution_auto').status, 'skipped');
});

test('parallel context lookups remain distinct, measured, and bounded', () => {
  let time = 1_800_000_000_000;
  const ledger = new CognitiveTraceLedger({clock:()=>time});
  const id=ledger.start('diagnostic');
  const names=['context_intentions','context_lessons','context_reflections',
    'context_work','context_agenda','context_continuity','context_messages'];
  for(const [index,stage] of names.entries()){
    time+=2;ledger.mark(id,stage,'running');
    time+=5;ledger.mark(id,stage,'done',{messages:index});
  }
  for(let i=0;i<40;i++){time++;ledger.mark(id,'decision','running');}
  const snap=ledger.snapshot('diagnostic',id);
  for(const stage of names) {
    assert.equal(snap.events.find(e=>e.stage===stage&&e.status==='done')?.duration_ms,5);
  }
  assert.ok(snap.events.length>32);
  assert.ok(snap.events.length<=96);
});


test('live telemetry delivers source events only to the owning signed session', () => {
  const ledger = new CognitiveTraceLedger();
  const own = [];
  const other = [];
  const stopOwn = ledger.subscribe('browser-a', (value) => own.push(value));
  const stopOther = ledger.subscribe('browser-b', (value) => other.push(value));
  const id = ledger.start('browser-a');
  ledger.mark(id, 'homeostasis', 'running', { note: 'never exported', state_stability: 0.6 });
  ledger.mark(id, 'homeostasis', 'done', { state_stability: 0.8 });
  ledger.finish(id);
  assert.ok(own.length >= 4);
  assert.equal(other.length, 0);
  assert.equal(own.at(-1).state, 'done');
  assert.equal(own.at(-1).id, id);
  assert.doesNotMatch(JSON.stringify(own), /never exported/);
  stopOwn();
  stopOther();
  assert.equal(ledger.listenerCount, 0);
  assert.equal(ledger.listeners.size, 0);
});

test('live event stream subscribers are bounded and isolated from handler failures', () => {
  const ledger = new CognitiveTraceLedger();
  const stops = Array.from({ length: 4 }, () => ledger.subscribe('same-browser', () => {
    throw new Error('simulated broken browser');
  }));
  assert.equal(stops.every(Boolean), true);
  assert.equal(ledger.subscribe('same-browser', () => {}), null);
  const id = ledger.start('same-browser');
  assert.equal(ledger.mark(id, 'input', 'done'), true);
  assert.equal(ledger.finish(id), true);
  for (const stop of stops) stop();
  stops[0]();
  assert.equal(ledger.listenerCount, 0);
  assert.equal(ledger.subscribe('same-browser', () => {}) instanceof Function, true);
});

test('autonomous live stream cannot receive conversation events, or vice versa', () => {
  const ledger = new CognitiveTraceLedger();
  const liveAutonomy = [];
  const publicView = [];
  const stopAutonomy = ledger.subscribe('__internal_autonomy__', snapshot => liveAutonomy.push(snapshot));
  const stopPublic = ledger.subscribe('public', snapshot => publicView.push(snapshot));
  const convo = ledger.start('public');
  const autonomy = ledger.startAutonomy('ambient');
  ledger.mark(autonomy, 'regulation', 'done', { state_curiosity: .82 });
  ledger.finish(autonomy);
  assert.equal(liveAutonomy.every(snapshot => snapshot.kind === 'autonomy'), true);
  assert.equal(publicView.every(snapshot => snapshot.id === convo), true);
  assert.equal(ledger.snapshot('public', autonomy).available, false);
  stopAutonomy();
  stopPublic();
});
