import test from 'node:test';
import assert from 'node:assert/strict';
import {
  licenseAssessment,
  scoreRepository,
  scoutQuery,
} from '../src/capability_scout.js';

test('Capability Scout strongly prefers permissive licenses', () => {
  assert.equal(licenseAssessment('MIT').policy, 'compatible');
  assert.equal(licenseAssessment('Apache-2.0').product_use, true);
  assert.equal(licenseAssessment('NOASSERTION').policy, 'unknown');
  assert.equal(licenseAssessment('').product_use, false);
});

test('Capability Scout scores maintained relevant repositories above stale archived ones', () => {
  const theme = {
    id: 'research',
    signals: ['agent','research','experiment','autonomous'],
  };
  const recent = scoreRepository({
    name: 'AutonomousResearchAgent',
    full_name: 'example/AutonomousResearchAgent',
    description: 'Autonomous research agent experiment framework',
    topics: ['agent','research'],
    license: { spdx_id: 'MIT' },
    pushed_at: new Date().toISOString(),
    stargazers_count: 1200,
    archived: false,
    fork: false,
  }, { theme, existingCapabilities: ['browser-control'] });

  const stale = scoreRepository({
    name: 'OldAgent',
    full_name: 'example/OldAgent',
    description: 'Old agent',
    topics: [],
    license: null,
    pushed_at: '2021-01-01T00:00:00Z',
    stargazers_count: 2,
    archived: true,
    fork: false,
  }, { theme, existingCapabilities: ['agent'] });

  assert.ok(recent.score > stale.score, { recent, stale });
  assert.equal(recent.license.policy, 'compatible');
  assert.equal(stale.experiment_eligible, false);
});

test('Capability Scout GitHub queries enforce freshness and exclude archived/forks', () => {
  const query = scoutQuery({
    queries: ['software agent sdk ai'],
    signals: ['software','agent'],
  }, 0);
  assert.match(query, /stars:>25/);
  assert.match(query, /archived:false/);
  assert.match(query, /pushed:>/);
});
