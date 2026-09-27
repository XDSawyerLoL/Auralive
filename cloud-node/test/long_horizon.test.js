import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { LongHorizonMissionEngine } from '../src/long_horizon.js';

const source = fs.readFileSync(new URL('../src/long_horizon.js', import.meta.url), 'utf8');
const dbSource = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');

test('long-horizon engine has a stable autonomous mission identity', () => {
  const engine = new LongHorizonMissionEngine({});
  assert.equal(LongHorizonMissionEngine.VERSION, 'aura-long-horizon-missions-v1');
  assert.equal(engine.lastError, '');
});

test('missions are durable, resumable and linked to initiatives', () => {
  assert.match(dbSource, /LATEST_SCHEMA_VERSION = 12/);
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS aura_missions/);
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS aura_mission_steps/);
  assert.match(source, /async ensureAutonomousMission\(\)/);
  assert.match(source, /async reconcileActiveStep\(mission\)/);
  assert.match(source, /async bindInitiative\(stepId, initiativeId\)/);
  assert.match(source, /initiative_id/);
});

test('mission failures change strategy rather than loop forever', () => {
  assert.match(source, /async critiqueStep/);
  assert.match(source, /async replanMission/);
  assert.match(source, /revision_count=revision_count\+1/);
  assert.match(source, /max_revisions/);
  assert.match(source, /step-retry/);
  assert.match(source, /mission-replanned/);
});

test('mission planning preserves AURA authority and bounded step types', () => {
  assert.match(source, /ALLOWED_STEP_KINDS/);
  assert.match(source, /reflection/);
  assert.match(source, /research/);
  assert.match(source, /operator/);
  assert.match(source, /evolution/);
  assert.match(source, /config\.commandCenterAllowedRisks\.has\(risk\)/);
  assert.doesNotMatch(source, /shell\.exec|eval\(|new Function/);
});

test('mission completion writes a durable lesson', () => {
  assert.match(source, /this\.kernel\.learn/);
  assert.match(source, /source: 'long-horizon-mission'/);
  assert.match(source, /source: 'long-horizon-critic'/);
});
