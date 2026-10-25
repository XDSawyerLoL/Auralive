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


test('Hostinger entry uses one direct Fastify listener and keeps lsnode-compatible async boot', () => {
  assert.match(gatewaySource, /await import\('\.\/src\/server\.js'\)/);
  assert.match(gatewaySource, /await app\.listen\(\{ host: publicHost, port: publicPort \}\)/);
  assert.match(gatewaySource, /void bootAura\(\)/);
  assert.doesNotMatch(gatewaySource, /proxyToAura/);
  assert.doesNotMatch(gatewaySource, /app\.listen\(\{ host: '127\.0\.0\.1', port: 0 \}\)/);
  assert.match(gatewaySource, /single-listener recovery server/);
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


test('bridge completion requires actual executed and successful operator steps', async () => {
  const { workerCompletionVerified } = await import('../src/bridge.js');
  const good = {
    ok: true, result: {
      executed: true, status: 'completed',
      steps: [{
        type: 'browser.audit', ok: true, checks_passed: 2, checks_total: 2,
        checks: [
          { ok: true, screenshot_sha256: 'a'.repeat(64) },
          { ok: true, screenshot_sha256: 'b'.repeat(64) },
        ],
      }],
    },
  };
  assert.equal(workerCompletionVerified('operator', good), true);
  assert.equal(workerCompletionVerified('operator', {
    ok: true, result: { executed: false, status: 'error', steps: [] },
  }), false);
  assert.equal(workerCompletionVerified('operator', {
    ok: true, result: { executed: true, status: 'completed', steps: [{ type: 'browser.audit', ok: false }] },
  }), false);
  assert.equal(workerCompletionVerified('operator', {
    ok: true, result: { executed: true, status: 'completed', steps: [] },
  }), false);
  assert.equal(workerCompletionVerified('compute', { ok: true, result: { value: 0 } }), true);
  assert.equal(workerCompletionVerified('compute', { ok: true, result: { ok: false } }), false);
});


test('Cloud refuses fabricated browser audit and unsigned file write receipts', async () => {
  const { workerCompletionVerified } = await import('../src/bridge.js');
  const envelope = (step) => ({
    ok: true, result: { executed: true, status: 'completed', steps: [step] },
  });
  assert.equal(workerCompletionVerified('operator', envelope({
    type: 'browser.audit', ok: true, checks_passed: 2, checks_total: 2, checks: [],
  })), false);
  assert.equal(workerCompletionVerified('operator', envelope({
    type: 'fs.write', ok: true, path: 'test.txt', verified: false,
  })), false);
  assert.equal(workerCompletionVerified('operator', envelope({
    type: 'fs.write', ok: true, path: 'test.txt', verified: true, sha256: 'f'.repeat(64),
  })), true);
});

test('Cloud recalculates the SHA-256 of file content instead of trusting a reported digest', async () => {
  const { createHash } = await import('node:crypto');
  const { workerCompletionVerified } = await import('../src/bridge.js');
  const text = 'Contenu réel du fichier AURA.';
  const proof = {
    ok: true, result: {
      executed: true, status: 'completed',
      steps: [{
        type: 'fs.read', ok: true, path: 'allowed.txt',
        content: text,
        bytes: Buffer.byteLength(text, 'utf8'),
        sha256: createHash('sha256').update(text).digest('hex'),
      }],
    },
  };
  assert.equal(workerCompletionVerified('operator', proof), true);
  const modified = structuredClone(proof);
  modified.result.steps[0].content = 'Contenu falsifié';
  assert.equal(workerCompletionVerified('operator', modified), false);
});


test('Cloud verifies typed receipts for personal search, CSV, comparison and backup tasks', async () => {
  const { workerCompletionVerified } = await import('../src/bridge.js');
  const wrap = (step) => ({
    ok: true, result: { executed: true, status: 'completed', steps: [step] },
  });
  const valid = [
    { type: 'files.search', ok: true, verified: true, matches_count: 1,
      files_scanned: 1, matches: [{ line: 3, file_sha256: 'a'.repeat(64) }] },
    { type: 'data.csv.summary', ok: true, verified: true, rows: 3,
      columns: ['montant'], numeric: { montant: { sum: '18.00' } },
      source_sha256: 'b'.repeat(64) },
    { type: 'files.compare', ok: true, verified: true, identical: false,
      left_sha256: 'a'.repeat(64), right_sha256: 'b'.repeat(64), diff_lines: ['+nouveau'] },
    { type: 'files.backup', ok: true, verified: true,
      source: 'notes.txt', backup: 'notes.txt.bak', bytes: 10, sha256: 'c'.repeat(64) },
  ];
  for (const step of valid) {
    assert.equal(workerCompletionVerified('operator', wrap(step)), true, step.type);
    assert.equal(workerCompletionVerified('operator', wrap({ ...step, verified: false })), false, step.type);
  }
  assert.equal(workerCompletionVerified('operator', wrap({
    ...valid[0], matches_count: 3,
  })), false);
  assert.equal(workerCompletionVerified('operator', wrap({
    ...valid[3], sha256: 'not-64-hex-chars',
  })), false);
});


test('Cloud accepts factual administrative counts and rejects invented administrative outcomes', async () => {
  const { workerCompletionVerified } = await import('../src/bridge.js');
  const wrap = (step) => ({
    ok: true, result: { executed: true, status: 'completed', steps: [step] },
  });
  const inventory = {
    type: 'admin.inventory', ok: true, verified: true, read_only: true,
    files_scanned: 5, files_counted: 3,
    categories: { factures: 1, impots: 1, a_identifier: 1 },
    limitations: ['Noms de fichiers uniquement'],
  };
  assert.equal(workerCompletionVerified('operator', wrap(inventory)), true);
  assert.equal(workerCompletionVerified('operator', wrap({ ...inventory, files_counted: 9 })), false);
  assert.equal(workerCompletionVerified('operator', wrap({ ...inventory, verified: false })), false);
  assert.equal(workerCompletionVerified('operator', wrap({
    type: 'admin.locate', ok: true, verified: true, read_only: true,
    matches: ['facture_electricite.pdf'], matches_count: 1,
  })), true);
  assert.equal(workerCompletionVerified('operator', wrap({
    type: 'admin.locate', ok: true, verified: true, read_only: true,
    matches: [], matches_count: 1,
  })), false);
});
