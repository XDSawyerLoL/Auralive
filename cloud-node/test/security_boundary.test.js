import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const kernelSource = fs.readFileSync(new URL('../src/kernel.js', import.meta.url), 'utf8');

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

test('public relational chat is isolated by a signed browser conversation session', () => {
  assert.match(serverSource, /aura_chat_session/);
  assert.match(serverSource, /chatSessionSignature/);
  assert.match(serverSource, /ensureChatSession/);
  assert.match(serverSource, /const privateView = isPrivate\(request\)/);
  assert.match(serverSource, /chatSessionId/);
  assert.match(kernelSource, /session_id=\?/);
  assert.match(kernelSource, /private-founder/);
  assert.doesNotMatch(
    serverSource,
    /kernel\.chat\(text,\s*String\(request\.body\?\.author[^\n]+,\s*true\)/,
  );
});

test('public chat cannot read private cognitive collections or inject raw text into global stimuli', () => {
  assert.match(kernelSource, /privateView \? this\.intentions\(6\) : Promise\.resolve\(\[\]\)/);
  assert.match(kernelSource, /privateView \? this\.lessons\(6\) : Promise\.resolve\(\[\]\)/);
  assert.match(kernelSource, /privateView \? this\.reflections\(4\) : Promise\.resolve\(\[\]\)/);
  assert.match(kernelSource, /privateView \? this\.workItems\(5\) : Promise\.resolve\(\[\]\)/);
  assert.match(kernelSource, /text_length: content\.length/);
  assert.match(kernelSource, /privateView \? 'cloud-private' : 'cloud-public'/);
  assert.match(kernelSource, /privateRelationship: privateView/);
});


test('public operational dashboard is read-only while raw cognitive and mutation routes stay private', () => {
  assert.match(serverSource, /app\.get\('\/api\/dashboard\/public'/);
  assert.match(serverSource, /visibility:\s*'public-read-only'/);
  assert.match(serverSource, /raw_private_memory_public:\s*false/);
  assert.match(serverSource, /founder_conversation_public:\s*false/);
  assert.match(serverSource, /mutations_public:\s*false/);
  assert.match(serverSource, /execution_controls_public:\s*false/);
  assert.match(serverSource, /app\.post\('\/api\/scout\/run'[\s\S]{0,300}requirePrivate/);
});
