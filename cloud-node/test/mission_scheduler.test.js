import test from 'node:test';
import assert from 'node:assert/strict';
import { selectNextMission } from '../src/mission_scheduler.js';

const missions = [
  { id: 'a', status: 'running', priority: 0.95, updated_at: '2026-10-12T00:00:00Z' },
  { id: 'b', status: 'waiting', priority: 0.75, updated_at: '2026-10-12T00:00:01Z' },
  { id: 'c', status: 'planning', priority: 0.50, updated_at: '2026-10-12T00:00:02Z' },
];
test('cooperative scheduler rotates across active projects without priority starvation', () => {
  assert.equal(selectNextMission(missions)?.id, 'a');
  assert.equal(selectNextMission(missions, 'a')?.id, 'b');
  assert.equal(selectNextMission(missions, 'b')?.id, 'c');
  assert.equal(selectNextMission(missions, 'c')?.id, 'a');
});
test('paused or completed missions never enter the active rotation', () => {
  const rows = [{ id: 'x', status: 'paused', priority: 1 }, { id: 'y', status: 'completed', priority: 1 }];
  assert.equal(selectNextMission(rows), null);
  assert.equal(selectNextMission(null), null);
});
test('stable ordering and missing previous cursor return deterministic selection', () => {
  assert.equal(selectNextMission([...missions].reverse(), 'missing')?.id, 'a');
});
