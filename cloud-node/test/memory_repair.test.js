import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileCapabilityMemory } from '../src/capability_memory.js';
import { CapabilityFabric } from '../src/capability_fabric.js';
import { SoftwareRepairEngine, generateRepairCandidates } from '../src/software_repair.js';

function registerMemoryTools(fabric) {
  fabric.register({
    id: 'memory.test.primary',
    tags: ['memory-test'],
    trust: 0.80,
    observed_reliability: 0.80,
    semantic_reliability: 0.80,
    latency_ms: 40,
  }, async () => {
    throw new Error('injected failure');
  });
  fabric.register({
    id: 'memory.test.backup',
    tags: ['memory-test'],
    trust: 0.77,
    observed_reliability: 0.77,
    semantic_reliability: 0.77,
    latency_ms: 80,
  }, async () => ({ ok: true, result: { recovered: true } }));
}

test('capability reliability survives process reconstruction and changes first choice', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aura-memory-test-'));
  const file = path.join(root, 'memory.json');
  try {
    const first = new CapabilityFabric({ persistence: new FileCapabilityMemory(file) });
    registerMemoryTools(first);
    assert.equal(first.select({ requiredTags: ['memory-test'] }).id, 'memory.test.primary');
    await assert.rejects(() => first.execute('memory.test.primary', {}), /injected failure/);

    const restarted = new CapabilityFabric({ persistence: new FileCapabilityMemory(file) });
    registerMemoryTools(restarted);
    const hydrated = await restarted.hydrate();
    assert.ok(hydrated.restored >= 1);
    assert.equal(restarted.select({ requiredTags: ['memory-test'] }).id, 'memory.test.backup');

    const learnedPrimary = restarted.list({ includeDisabled: true })
      .find((item) => item.id === 'memory.test.primary');
    assert.ok(learnedPrimary.observed_reliability < 0.80);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('repair candidate generator proposes bounded edits rather than arbitrary code', () => {
  const source = 'export function f(x) { return x - 3; }\n';
  const candidates = generateRepairCandidates(source, { maxCandidates: 50 });
  assert.ok(candidates.length > 0);
  assert.ok(candidates.length <= 50);
  assert.ok(candidates.some((item) => item.detail === '-->+'));
  assert.ok(candidates.every((item) => typeof item.source === 'string'));
});

test('software repair blocks path traversal', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aura-repair-path-test-'));
  try {
    const engine = new SoftwareRepairEngine({ workspaceRoot: root });
    assert.throws(() => engine.safePath('../outside.mjs'), /escapes workspace/i);
    assert.throws(() => engine.safePath('/tmp/outside.mjs'), /invalid/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('software repair keeps only a test-passing patch and confirms it twice', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aura-repair-test-'));
  try {
    await writeFile(
      path.join(root, 'subject.mjs'),
      'export function adjust(x) { return x - 3; }\n',
      'utf8',
    );
    await writeFile(
      path.join(root, 'subject.test.mjs'),
      "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { adjust } from './subject.mjs';\ntest('adjust',()=>{ assert.equal(adjust(1),4); assert.equal(adjust(8),11); });\n",
      'utf8',
    );

    const engine = new SoftwareRepairEngine({
      workspaceRoot: root,
      timeoutMs: 4000,
      maxCandidates: 80,
    });
    const result = await engine.repair({
      sourceFile: 'subject.mjs',
      testFile: 'subject.test.mjs',
    });

    assert.equal(result.baseline.pass, false);
    assert.equal(result.repaired, true);
    assert.equal(result.validation.pass, true);
    assert.equal(result.confirmation.pass, true);
    assert.notEqual(result.original_sha256, result.final_sha256);
    assert.equal((await engine.validate('subject.test.mjs')).pass, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
