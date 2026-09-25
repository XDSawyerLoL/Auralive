import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const bridgeSource = fs.readFileSync(new URL('../src/bridge.js', import.meta.url), 'utf8');

test('bridge completion route accepts bounded media payloads without raising global body limit', () => {
  assert.match(serverSource, /bodyLimit:\s*24\s*\*\s*1024\s*\*\s*1024/);
  assert.match(serverSource, /\/api\/bridge\/jobs\/:id\/complete/);
});

test('bridge exposes renewable leases for long-running local jobs', () => {
  assert.match(serverSource, /\/api\/bridge\/jobs\/:id\/renew/);
  assert.match(bridgeSource, /async renew\(id, workerId\)/);
  assert.match(bridgeSource, /lease_until=\?,updated_at=\?/);
});

test('bridge stores media results above the former 12 MB truncation threshold', () => {
  assert.match(bridgeSource, /slice\(0, 20_000_000\)/);
});
