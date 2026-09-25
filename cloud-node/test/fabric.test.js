import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DagCompiler,
  TaskGraphExecutor,
  validateTaskGraph,
} from '../src/task_graph.js';
import {
  CapabilityFabric,
  normalizeCapability,
  scoreCapability,
} from '../src/capability_fabric.js';
import fs from 'node:fs';

const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const dbSource = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const kernelSource = fs.readFileSync(new URL('../src/kernel.js', import.meta.url), 'utf8');
const edgeSource = fs.readFileSync(new URL('../../edge/aura-fabric-worker/src/index.js', import.meta.url), 'utf8');

test('typed DAG validation keeps every node when parallelism is bounded', () => {
  const graph = validateTaskGraph({
    objective: 'Tester la parallélisation',
    max_parallel: 2,
    nodes: [
      { id: 'a', capability: 'web.fetch', depends_on: [], input: { url: 'https://a.test' } },
      { id: 'b', capability: 'web.fetch', depends_on: [], input: { url: 'https://b.test' } },
      { id: 'c', capability: 'web.fetch', depends_on: [], input: { url: 'https://c.test' } },
      { id: 'd', capability: 'web.research', depends_on: ['a', 'b', 'c'], input: { question: 'fusion' } },
    ],
  }, { maxNodes: 16, maxParallel: 2 });

  assert.equal(graph.nodes.length, 4);
  assert.deepEqual(graph.layers, [['a', 'b'], ['c'], ['d']]);
});

test('typed DAG refuses cycles and unknown capabilities are not invented by validation', () => {
  assert.throws(() => validateTaskGraph({
    objective: 'cycle',
    nodes: [
      { id: 'a', capability: 'one', depends_on: ['b'] },
      { id: 'b', capability: 'two', depends_on: ['a'] },
    ],
  }), /cycle détecté/);
});

test('capability score prefers trusted reliable low-latency providers', () => {
  const strong = normalizeCapability({
    id: 'edge.strong',
    transport: 'edge-http',
    tags: ['research'],
    trust: 0.9,
    observed_reliability: 0.93,
    latency_ms: 150,
  });
  const weak = normalizeCapability({
    id: 'edge.weak',
    transport: 'edge-http',
    tags: ['research'],
    trust: 0.55,
    observed_reliability: 0.6,
    latency_ms: 2500,
  });
  assert.ok(scoreCapability(strong, { requiredTags: ['research'] })
    > scoreCapability(weak, { requiredTags: ['research'] }));
});

test('remote capabilities cannot grant themselves side effects', async () => {
  const substrate = {
    async assertSafeUrl() { return true; },
  };
  const fabric = new CapabilityFabric({ webSubstrate: substrate });
  fabric.register({
    id: 'edge.write',
    transport: 'edge-http',
    endpoint: 'https://edge.example',
    tags: ['action'],
    trust: 0.7,
    side_effects: true,
  });
  await assert.rejects(
    () => fabric.executeRemote(fabric.registry.get('edge.write'), {}),
    /effet de bord remote interdit/,
  );
});

test('graph executor fans out a layer and carries dependency outputs forward', async () => {
  const calls = [];
  const fabric = {
    async execute(capability, input) {
      calls.push({ capability, input });
      if (capability === 'source') return { ok: true, result: input.value };
      if (capability === 'merge') {
        return {
          ok: true,
          result: Object.values(input.dependencies).join('+'),
        };
      }
      throw new Error('unexpected capability');
    },
  };
  const executor = new TaskGraphExecutor(fabric);
  const result = await executor.execute({
    objective: 'merge',
    nodes: [
      { id: 'a', capability: 'source', input: { value: 'A' }, depends_on: [] },
      { id: 'b', capability: 'source', input: { value: 'B' }, depends_on: [] },
      { id: 'm', capability: 'merge', input: {}, depends_on: ['a', 'b'] },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.results.m.result, 'A+B');
  assert.equal(calls.length, 3);
});

test('compiler fallback uses a research capability without pretending it knows the answer', async () => {
  const compiler = new DagCompiler({ enabled: false });
  const graph = await compiler.compile('Quel est le statut actuel ?', [
    { id: 'web.research', tags: ['research'], side_effects: false, trust: 0.9 },
  ]);
  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.nodes[0].capability, 'web.research');
  assert.equal(graph.nodes[0].verification, 'evidence');
});


test('Fabric is wired into AURA runtime, memory and live cognition', () => {
  assert.match(serverSource, /new CapabilityFabric/);
  assert.match(serverSource, /new DagCompiler/);
  assert.match(serverSource, /new TaskGraphExecutor/);
  assert.match(serverSource, /await fabric\.start\(\)/);
  assert.match(serverSource, /fabric\.stop\(\)/);
  assert.match(serverSource, /\/api\/fabric\/plan/);
  assert.match(serverSource, /\/api\/fabric\/execute/);
  assert.match(kernelSource, /this\.fabric\.execute/);
  assert.match(configSource, /AURA_FABRIC_DISCOVERY_URLS/);
  assert.match(dbSource, /aura_fabric_capabilities/);
  assert.match(dbSource, /aura_fabric_graphs/);
  assert.match(dbSource, /aura_fabric_node_runs/);
});

test('Fabric remote execution is compute/read only by construction', () => {
  const source = fs.readFileSync(new URL('../src/capability_fabric.js', import.meta.url), 'utf8');
  assert.match(source, /effet de bord remote interdit par politique AURA/);
  assert.match(source, /arbitrary_remote_shell:\s*false/);
  assert.match(source, /policy:\s*'typed-capabilities-only'/);
});


test('edge Fabric worker fails closed without its machine secret', () => {
  assert.match(edgeSource, /if \(!expected\) return false/);
  assert.match(edgeSource, /capability not allowed/);
  assert.match(edgeSource, /arbitrary_code:\s*false/);
});
