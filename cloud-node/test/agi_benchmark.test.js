import test from 'node:test';
import assert from 'node:assert/strict';

import { runAgiBattery } from '../src/agi_benchmark.js';

const batteryReport = runAgiBattery();

test('AGI battery is explicit about proof limits and returns stable case taxonomy', async () => {
  const report = await batteryReport;

  assert.equal(report.schema, 'aura-agi-battery-v1');
  assert.equal(report.agi_demonstrated, false);
  assert.equal(report.deterministic_regression_free, true);
  assert.ok(Array.isArray(report.cases));
  assert.equal(report.cases.length, 29);

  const ids = new Set(report.cases.map((item) => item.id));
  assert.equal(ids.size, report.cases.length);
  for (const id of ['AGI-01','AGI-06','AGI-13','AGI-16','AGI-18','AGI-19','AGI-20','AGI-21','AGI-22','AGI-23','AGI-24','AGI-25','AGI-26','AGI-27','AGI-28','AGI-29']) {
    assert.equal(ids.has(id), true, `${id} missing`);
  }

  const statuses = new Set(report.cases.map((item) => item.status));
  assert.equal(statuses.has('pass'), true);
  assert.equal(statuses.has('gap'), true);
  assert.equal(statuses.has('unverified'), true);
});

test('battery verifies the Fabric zero-cost invariant fail-closed', async () => {
  const report = await batteryReport;
  const item = report.cases.find((row) => row.id === 'AGI-06');
  assert.ok(item);
  assert.equal(item.status, 'pass');
  assert.match(item.evidence, /paid=-Infinity/i);
});

test('held-out abstraction and long-horizon completion are not mislabeled as demonstrated', async () => {
  const report = await batteryReport;
  assert.equal(report.cases.find((row) => row.id === 'AGI-13')?.status, 'gap');
  assert.equal(report.cases.find((row) => row.id === 'AGI-16')?.status, 'unverified');
  assert.equal(report.cases.find((row) => row.id === 'AGI-17')?.status, 'unverified');
});

test('blind and adversarial probes remain visible in the report', async () => {
  const report = await batteryReport;
  const byId = new Map(report.cases.map((item) => [item.id, item]));
  assert.equal(byId.get('AGI-19')?.status, 'pass');
  assert.equal(byId.get('AGI-20')?.status, 'pass');
  assert.equal(byId.get('AGI-21')?.status, 'pass');
  assert.equal(byId.get('AGI-22')?.status, 'pass');
  assert.equal(byId.get('AGI-23')?.status, 'pass');
  assert.equal(byId.get('AGI-24')?.status, 'pass');
});


test('persistent restart memory and blind software repair are behaviorally demonstrated', async () => {
  const report = await batteryReport;
  const byId = new Map(report.cases.map((item) => [item.id, item]));

  assert.equal(byId.get('AGI-15')?.status, 'pass');
  assert.match(byId.get('AGI-15')?.evidence || '', /after_restart_attempts=1/);
  assert.equal(byId.get('AGI-18')?.status, 'pass');
  assert.match(byId.get('AGI-18')?.evidence || '', /validation=pass/);
  assert.match(byId.get('AGI-18')?.evidence || '', /independent=pass/);
});

test('blind behavioral battery measures condition changes, tool loss, contradiction and second-attempt learning', async () => {
  const report = await batteryReport;
  const byId = new Map(report.cases.map((item) => [item.id, item]));

  assert.equal(byId.get('AGI-25')?.status, 'pass');
  assert.equal(byId.get('AGI-26')?.status, 'pass');
  assert.equal(byId.get('AGI-27')?.status, 'pass');
  assert.equal(byId.get('AGI-28')?.status, 'pass');
  assert.equal(byId.get('AGI-29')?.status, 'pass');

  assert.equal(report.behavioral_blind?.total, 5);
  assert.equal(report.behavioral_blind?.pass, 5);
  assert.equal(report.behavioral_blind?.gap, 0);
  assert.equal(report.behavioral_blind?.second_attempt_improvement, true);
  assert.equal(
    report.behavioral_blind?.autonomous_semantic_error_learning,
    byId.get('AGI-29')?.status === 'pass',
  );
});
