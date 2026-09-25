import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('chat response issues a short-lived Mairaiy voice ticket', () => {
  assert.match(serverSource, /function createVoiceTicket\(/);
  assert.match(serverSource, /voice_ticket:\s*answer \? createVoiceTicket\(answer\) : ''/);
  assert.match(serverSource, /voice_profile:\s*'mairaiy'/);
  assert.match(serverSource, /aura-voice:/);
});

test('voice playback no longer requires a manual dashboard token', () => {
  const start = serverSource.indexOf("app.post('/api/voice/speak'");
  const end = serverSource.indexOf("app.post('/api/image/generate'", start);
  assert.ok(start >= 0 && end > start);
  const route = serverSource.slice(start, end);
  assert.doesNotMatch(route, /requirePrivate\(request, reply\)/);
  assert.match(route, /validVoiceTicket\(ticket, text\)/);
  assert.match(route, /bridge\.synthesize\(text/);
});

test('voice ticket is bound to exact text and expires quickly', () => {
  assert.match(serverSource, /voiceSignature\(expiresAt, text\)/);
  assert.match(serverSource, /slice\(0, 430\)/);
  assert.match(serverSource, /Math\.min\(maxAgeSeconds, 300\)/);
  assert.match(serverSource, /expiresAt > Math\.floor\(Date\.now\(\) \/ 1000\) \+ 300/);
});
