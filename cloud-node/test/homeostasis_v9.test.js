import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('bridge heartbeat is Cloud-authoritative and never imports worker organism', () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const block = server.slice(
    server.indexOf("app.post('/api/bridge/heartbeat'"),
    server.indexOf("app.post('/api/bridge/claim'")
  );
  assert.match(block, /mode: 'cloud-authoritative'/);
  assert.match(block, /accepted_worker_state: false/);
  assert.doesNotMatch(block, /importOrganismState\(request\.body\.organism/);
});

test('runtime heartbeat declares version only and does not upload organism body', () => {
  const worker = fs.readFileSync(new URL('../../aura_runtime/worker.py', import.meta.url), 'utf8');
  const start = worker.indexOf('async def _heartbeat');
  const end = worker.indexOf('async def _claim', start);
  const block = worker.slice(start, end);
  assert.match(block, /"organism_version"/);
  assert.match(block, /"organism_schema_revision"/);
  assert.doesNotMatch(block, /"organism": organism/);
});

test('premium neural map consumes v9 dynamics, not removed tension/fatigue fields', () => {
  const runtime = fs.readFileSync(new URL('../src/dashboard-runtime.js', import.meta.url), 'utf8');
  const start = runtime.indexOf('function initLivingAuraScene');
  const end = runtime.indexOf('function renderCommandCenter', start);
  const block = runtime.slice(start, end);
  assert.match(block, /dynamics\.agitation/);
  assert.match(block, /dynamics\.activation/);
  assert.match(block, /dynamics\.recovery/);
  assert.doesNotMatch(block, /fatigue_cognitive/);
  assert.doesNotMatch(block, /o\.tension/);
});

test('dashboard exposes the v9 secondary emotional dimensions', () => {
  const html = fs.readFileSync(new URL('../src/dashboard.js', import.meta.url), 'utf8');
  for (const id of [
    'emotion-satisfaction',
    'emotion-frustration',
    'emotion-attachment',
    'emotion-social',
    'emotion-dream',
    'emotion-silence',
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
});
