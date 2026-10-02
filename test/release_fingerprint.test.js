import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { AURA_RELEASE, releaseInfo } from '../src/release.js';

const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('release fingerprint is stable and identifies the Hostinger V9.3 package', () => {
  assert.equal(AURA_RELEASE.id, 'AURA-HOSTINGER-V9.3-CLOUD-FIRST');
  assert.equal(AURA_RELEASE.generation, 'v9.3');
  assert.equal(AURA_RELEASE.channel, 'hostinger/aura-cloud');
  assert.equal(AURA_RELEASE.execution_policy, 'cloud-first-local-optional');
  assert.equal(AURA_RELEASE.final_language_authority, 'AURA native cognition');
  assert.match(AURA_RELEASE.source_baseline, /^[0-9a-f]{40}$/);
  assert.deepEqual(releaseInfo(), AURA_RELEASE);
});

test('live public endpoints expose the deploy fingerprint', () => {
  assert.match(serverSource, /release:\s*releaseInfo\(\)/);
  assert.match(serverSource, /app\.get\('\/api\/kernel\/architecture'/);
  assert.match(serverSource, /app\.get\('\/healthz'/);
  assert.match(serverSource, /execution_policy:\s*'cloud-first-local-optional'/);
  assert.match(serverSource, /final_language_authority:\s*'AURA native cognition'/);
});
