import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gatewaySource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
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


test('Hostinger entry loads Fastify statically without a dynamic-import deadlock', () => {
  assert.match(gatewaySource, /import \{ app, bootstrap, startRuntimeLoop, stopAura \} from '\.\/src\/server\.js'/);
  assert.match(gatewaySource, /framework: 'fastify-direct'/);
  assert.match(gatewaySource, /app\.listen\(\{ host, port \}\)/);
  assert.match(gatewaySource, /const port = production[\s\S]*\? 3000/);
  assert.doesNotMatch(gatewaySource, /await import\('\.\/src\/server\.js'\)/);
  assert.doesNotMatch(gatewaySource, /native-node-gateway/);
  assert.match(serverSource, /bodyLimit:\s*24\s*\*\s*1024\s*\*\s*1024/);
});

test('Hostinger runtime resets the MySQL pool and retries quickly after startup failure', () => {
  assert.match(serverSource, /await closeDb\(\)/);
  assert.match(serverSource, /15_000/);
  assert.match(serverSource, /reconnexion automatique programmée/);
});

test('bridge exposes AURA Runtime host metadata without assuming Studio', () => {
  assert.match(bridgeSource, /SELECT worker_id,capabilities,model,voice,version,resources/);
  assert.match(bridgeSource, /host_product:/);
  assert.match(bridgeSource, /runtime_role:/);
  assert.match(bridgeSource, /runtime_packaging:/);
});

test('bridge leases jobs only to runtime workers that advertise the job kind', () => {
  assert.match(bridgeSource, /SELECT compute_consent,mesh_capabilities,resources/);
  assert.match(bridgeSource, /SELECT id,kind,target_worker_id,required_capabilities/);
  assert.match(bridgeSource, /const jobKinds = new Set/);
  assert.match(bridgeSource, /!jobKinds\.has\(kind\)/);
  assert.match(bridgeSource, /job_kinds:/);
});


test('bridge can terminalize queued or leased jobs', () => {
  assert.match(bridgeSource, /async cancelJob\(id, reason/);
  assert.match(bridgeSource, /status='cancelled'/);
  assert.match(bridgeSource, /status IN \('queued','leased'\)/);
});
