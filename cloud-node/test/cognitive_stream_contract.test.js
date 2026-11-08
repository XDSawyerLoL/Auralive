import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DASHBOARD_SCRIPT } from '../src/dashboard-runtime.js';
import { COGNITIVE_ATLAS_HTML } from '../src/cognitive_atlas_ui.js';

const serverSource = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('conversation and autonomous event endpoints are separated by authorization', () => {
  assert.match(serverSource, /app\.get\('\/api\/cognition\/events'/);
  assert.match(serverSource, /const session = ensureChatSession\(request, reply\)/);
  assert.match(serverSource, /app\.get\('\/api\/cognition\/autonomy\/events',[\s\S]*?if \(!requirePrivate\(request, reply\)\) return;/);
  assert.match(serverSource, /cognitiveTrace\.snapshotAutonomy\(\)/);
  assert.match(serverSource, /cognitiveTrace\.snapshot\(session\)/);
});

test('server SSE frames use the EventSource protocol and force proxy no-buffering', () => {
  assert.ok(serverSource.includes("raw.write('event: trace\\ndata: '"));
  assert.ok(serverSource.includes("'\\n\\n'"));
  assert.ok(serverSource.includes("'Content-Type': 'text/event-stream; charset=utf-8'"));
  assert.ok(serverSource.includes("'X-Accel-Buffering': 'no'"));
  assert.ok(serverSource.includes("'Cache-Control': 'private, no-store, no-transform'"));
  assert.match(serverSource, /reply\.hijack\(\)/);
  assert.match(serverSource, /raw\.once\('close', cleanup\)/);
  assert.match(serverSource, /unsubscribe\(\)/);
  assert.match(serverSource, /heartbeat\.unref\?\.\(\)/);
});

test('browser connects only after cookie preflight and always retains polling fallback', () => {
  assert.match(DASHBOARD_SCRIPT, /refreshCognitiveTrace\(\)\.then\(function\(\)\{if\(cogGraphReady\)connectCognitiveEventStream\(\);\}\)/);
  assert.match(DASHBOARD_SCRIPT, /new EventSource\(url,\{withCredentials:true\}\)/);
  assert.match(DASHBOARD_SCRIPT, /stream\.addEventListener\('trace'/);
  assert.match(DASHBOARD_SCRIPT, /stream\.onerror/);
  assert.match(DASHBOARD_SCRIPT, /await refreshCognitiveTrace\(\)/);
  assert.ok(COGNITIVE_ATLAS_HTML.includes('id="cogTransport"'));
});

test('a final POST response cannot be replaced by another worker session trace', () => {
  assert.match(DASHBOARD_SCRIPT, /snapshot\.id!==cogTraceId\)return/);
  assert.match(DASHBOARD_SCRIPT, /data\.id!==cogTraceId\)return/);
  assert.match(DASHBOARD_SCRIPT, /if\(!snapshot\.available&&cogTrace\?\.available\)return/);
  assert.match(DASHBOARD_SCRIPT, /cogTraceOrigin='reply'/);
});
