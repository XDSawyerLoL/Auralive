import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildInfo, buildMatches } from '../src/build_info.js';

const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const entrySource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('build identity honors explicit immutable git SHA', () => {
  const previous = process.env.AURA_GIT_SHA;
  process.env.AURA_GIT_SHA = 'abcdef1234567890';
  try {
    const info = buildInfo();
    assert.equal(info.git_sha, 'abcdef1234567890');
    assert.equal(info.git_sha_short, 'abcdef123456');
    assert.equal(info.provenance_verified, true);
    assert.equal(buildMatches('abcdef123456').match, true);
    assert.equal(buildMatches('deadbeef').match, false);
  } finally {
    if (previous == null) delete process.env.AURA_GIT_SHA;
    else process.env.AURA_GIT_SHA = previous;
  }
});

test('production truth is exposed through build, health and bootstrap surfaces', () => {
  assert.match(serverSource, /app\.get\('\/api\/build'/);
  assert.match(serverSource, /build: buildInfo\(\)/);
  assert.match(serverSource, /\.\.\.buildInfo\(\)/);
  assert.match(serverSource, /production_truth: true/);
});

test('managed host entry honors PORT instead of silently falling back to 3000', () => {
  assert.match(entrySource, /const managedPort = process\.env\.PORT/);
  assert.match(entrySource, /process\.env\.AURA_PORT \|\| managedPort \|\| '3000'/);
});

