import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { solveGridTask, applyGridProgram, gridEquals } from '../src/grid_reasoning.js';
import { StrategyTransferEngine } from '../src/strategy_transfer.js';
import { JsonMissionStore, ResumableMissionRunner } from '../src/durable_mission.js';
import { DagCompiler } from '../src/task_graph.js';

test('grid program induction generalizes a learned transformation to a held-out grid', () => {
  const train = [
    { input: [[1,0,2],[0,3,0]], output: applyGridProgram('mirror-horizontal', [[1,0,2],[0,3,0]]) },
    { input: [[4,5,0],[0,6,7]], output: applyGridProgram('mirror-horizontal', [[4,5,0],[0,6,7]]) },
  ];
  const heldout = [[8,0,9],[1,2,3]];
  const result = solveGridTask({ train, test: [heldout] });
  assert.equal(result.solved, true);
  assert.equal(result.program.name, 'mirror-horizontal');
  assert.equal(gridEquals(result.outputs[0], applyGridProgram('mirror-horizontal', heldout)), true);
});

test('strategy transfer uses abstract structure instead of source-domain vocabulary', () => {
  const engine = new StrategyTransferEngine();
  engine.learn({
    domain: 'clinical-triage',
    features: { conflicting_evidence: true, high_impact: true, irreversible: true },
    action: 'verify-independent',
    reward: 1,
  });
  const recommendation = engine.recommend(
    { conflicting_evidence: true, high_impact: true, irreversible: true, logistics: true },
    { excludeDomain: 'warehouse-dispatch', minimumSimilarity: 0.7 },
  );
  assert.equal(recommendation.transferred, true);
  assert.equal(recommendation.action, 'verify-independent');
  assert.equal(recommendation.source_domain, 'clinical-triage');
});

test('durable mission resumes after runner reconstruction and preserves replan history', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aura-durable-mission-test-'));
  try {
    const file = path.join(root, 'missions.json');
    const execute = async (capability) => {
      if (capability === 'primary.offline') throw new Error('offline');
      return { ok: true, result: { capability } };
    };

    const runner1 = new ResumableMissionRunner({
      store: new JsonMissionStore(file),
      executeCapability: execute,
    });
    await runner1.start({
      id: 'mission',
      steps: [
        { id: 'one', preferred: 'one', duration_ms: 3600000 },
        { id: 'two', preferred: 'primary.offline', fallback: 'backup', duration_ms: 3600000 },
        { id: 'three', preferred: 'three', duration_ms: 3600000 },
      ],
    });
    const partial = await runner1.runSlice('mission', { maxCompletedSteps: 2 });
    assert.equal(partial.current_step, 2);
    assert.equal(partial.revision_count, 1);

    const runner2 = new ResumableMissionRunner({
      store: new JsonMissionStore(file),
      executeCapability: execute,
    });
    await runner2.resume('mission');
    const final = await runner2.runSlice('mission', { maxCompletedSteps: 4 });
    assert.equal(final.status, 'completed');
    assert.ok(final.resumed_count >= 1);
    assert.ok(final.events.some((event) => event.type === 'replan'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('native DAG follows cue order and inserts compute in multi-tool missions', async () => {
  const compiler = new DagCompiler({ enabled: false });
  const graph = await compiler.compile(
    'Recherche le dossier inconnu, lis la fiche, calcule le total puis vérifie le résultat.',
    [
      { id: 'x.search', name: 'search', tags: ['research','search','evidence'], trust: 0.8 },
      { id: 'x.read', name: 'read', tags: ['read','fetch'], trust: 0.8 },
      { id: 'x.compute', name: 'compute', tags: ['compute','calculate','math'], trust: 0.8 },
      { id: 'x.verify', name: 'verify', tags: ['verify','evidence'], trust: 0.8 },
    ],
  );
  assert.deepEqual(
    graph.nodes.map((node) => node.capability),
    ['x.search','x.read','x.compute','x.verify'],
  );
  assert.deepEqual(graph.nodes[1].depends_on, [graph.nodes[0].id]);
  assert.deepEqual(graph.nodes[2].depends_on, [graph.nodes[1].id]);
  assert.deepEqual(graph.nodes[3].depends_on, [graph.nodes[2].id]);
});
