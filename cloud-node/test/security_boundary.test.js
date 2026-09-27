import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');

test('private cognitive state endpoints require AURA authentication', () => {
  for (const route of [
    '/api/kernel/soul',
    '/api/kernel/organism',
    '/api/kernel/lessons',
    '/api/kernel/intentions',
    '/api/kernel/activity',
    '/api/kernel/work',
    '/api/kernel/attention',
  ]) {
    const index = serverSource.indexOf(`app.get('${route}'`);
    assert.notEqual(index, -1, route);
    const excerpt = serverSource.slice(index, index + 420);
    assert.match(excerpt, /requirePrivate\(request, reply\)/, route);
  }
});

test('public chat and private-session login have bounded request rates', () => {
  assert.match(serverSource, /requireRateLimit/);
  assert.match(serverSource, /'public-chat'/);
  assert.match(serverSource, /'auth-session'/);
  assert.match(serverSource, /reply\.code\(429\)/);
  assert.match(configSource, /AURA_PUBLIC_CHAT_RATE_LIMIT_MAX/);
  assert.match(configSource, /AURA_AUTH_RATE_LIMIT_MAX/);
});

test('public dashboard uses a redacted state while private cognitive APIs stay locked', () => {
  assert.match(serverSource, /\/api\/kernel\/public/);
  assert.match(serverSource, /kernel\.soul\(\{ privateView: false \}\)/);
  assert.match(serverSource, /organismState\(\{ publicView: true \}\)/);
});

test('rate-limit buckets are pruned and hard bounded', () => {
  assert.match(serverSource, /pruneRateBuckets/);
  assert.match(serverSource, /RATE_BUCKET_LIMIT = 4096/);
  assert.match(serverSource, /rateBuckets\.delete/);
});
