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

test('client IP rate limits trust only a bounded reverse-proxy chain', () => {
  assert.match(configSource, /AURA_TRUST_PROXY_HOPS/);
  assert.match(serverSource, /trustProxy: config\.trustProxyHops > 0 \? config\.trustProxyHops : false/);
  assert.doesNotMatch(serverSource, /trustProxy:\s*true/);
});


test('public neural topology exposes bounded structural fields required by the map', () => {
  const index = serverSource.indexOf("app.get('/api/kernel/public/attention'");
  assert.notEqual(index, -1);
  const excerpt = serverSource.slice(index, index + 5000);
  for (const token of [
    'cluster:',
    'role:',
    'activity:',
    'centrality:',
    'pulse:',
    'status:',
    'links: safeLinks',
    'synapses: safeLinks.length',
    'active: safeNodes.filter',
  ]) {
    assert.equal(excerpt.includes(token), true, token);
  }
  assert.equal(excerpt.includes('metadata:'), false);
});


test('public self-state is read-only and bounded', () => {
  assert.match(serverSource, /app\.get\('\/api\/kernel\/public\/self-state'/);
  assert.doesNotMatch(serverSource, /app\.(post|put|patch|delete)\('\/api\/kernel\/public\/self-state'/);
  const index=serverSource.indexOf("app.get('/api/kernel/public/self-state'");
  const excerpt=serverSource.slice(index,index+3200);
  for(const token of ['primary_goal','secondary_goals','active_work','interests','open_loops','next_action','autonomy']) {
    assert.equal(excerpt.includes(token),true,token);
  }
});
