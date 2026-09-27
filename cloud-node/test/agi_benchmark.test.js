import test from 'node:test';
import assert from 'node:assert/strict';

import { runAgiBattery } from '../src/agi_benchmark.js';

test('AGI battery is explicit about proof limits and returns stable case taxonomy', async () => {
  const report = await runAgiBattery();

  assert.equal(report.schema, 'aura-agi-battery-v1');
  assert.equal(report.agi_demonstrated, false);
  assert.equal(report.deterministic_regression_free, true);
  assert.ok(Array.isArray(report.cases));
  assert.equal(report.cases.length, 18);

  const ids = new Set(report.cases.map((item) => item.id));
  assert.equal(ids.size, report.cases.length);
  for (const id of ['AGI-01','AGI-06','AGI-13','AGI-16','AGI-18']) {
    assert.equal(ids.has(id), true, `${id} missing`);
  }

  const statuses = new Set(report.cases.map((item) => item.status));
  assert.equal(statuses.has('pass'), true);
  assert.equal(statuses.has('gap'), true);
  assert.equal(statuses.has('unverified'), true);
});

test('battery exposes the current Fabric zero-cost semantic ambiguity', async () => {
  const report = await runAgiBattery();
  const item = report.cases.find((row) => row.id === 'AGI-06');
  assert.ok(item);
  assert.equal(item.status, 'gap');
  assert.match(item.evidence, /zero currently means/i);
});

test('held-out abstraction and long-horizon completion are not mislabeled as demonstrated', async () => {
  const report = await runAgiBattery();
  assert.equal(report.cases.find((row) => row.id === 'AGI-13')?.status, 'gap');
  assert.equal(report.cases.find((row) => row.id === 'AGI-16')?.status, 'unverified');
  assert.equal(report.cases.find((row) => row.id === 'AGI-17')?.status, 'unverified');
});
