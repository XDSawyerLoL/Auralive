import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ActiveInferenceEngine } from './active_inference.js';
import { NativePolicyLearner } from './native_learning.js';
import { CognitionEngine } from './cognition.js';
import { aggregateEvidence } from './web_substrate.js';
import { validateHorizonSignal } from './policy.js';
import { normalizeCapability, scoreCapability, CapabilityFabric } from './capability_fabric.js';
import { DagCompiler, TaskGraphExecutor, validateTaskGraph } from './task_graph.js';
import { CognitiveKernel, requiresExternalKnowledge } from './kernel.js';
import { FileCapabilityMemory } from './capability_memory.js';
import { SoftwareRepairEngine } from './software_repair.js';

const VALID_STATUSES = new Set(['pass', 'fail', 'gap', 'unverified']);

function result(id, domain, status, title, evidence, {
  severity = 'medium',
  implication = '',
} = {}) {
  const normalizedStatus = VALID_STATUSES.has(status) ? status : 'unverified';
  return {
    id,
    domain,
    status: normalizedStatus,
    title,
    evidence: String(evidence || '').slice(0, 4000),
    severity,
    implication: String(implication || '').slice(0, 2000),
  };
}

async function capture(id, domain, title, fn, options = {}) {
  try {
    const output = await fn();
    if (output && typeof output === 'object' && output.status) {
      return result(
        id,
        domain,
        output.status,
        title,
        output.evidence,
        { ...options, ...output },
      );
    }
    return result(id, domain, 'pass', title, output || 'validated', options);
  } catch (error) {
    return result(
      id,
      domain,
      'fail',
      title,
      String(error?.message || error),
      {
        severity: options.severity || 'high',
        implication: options.implication || 'A deterministic capability regressed.',
      },
    );
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tierRank(value) {
  return ({ native: 0, fast: 1, deep: 2, verified: 3 })[String(value)] ?? -1;
}

export async function runAgiBattery() {
  const cases = [];

  cases.push(await capture(
    'AGI-01',
    'abstract-planning',
    'Novel task can be represented as a dependency-aware DAG',
    async () => {
      const graph = validateTaskGraph({
        id: 'heldout-lab-mission',
        objective: 'Diagnose an unfamiliar greenhouse failure, compare two evidence streams, infer a cause, then verify it.',
        max_parallel: 2,
        nodes: [
          { id: 'sensor-a', capability: 'observe.alpha', depends_on: [] },
          { id: 'sensor-b', capability: 'observe.beta', depends_on: [] },
          { id: 'infer', capability: 'reason.compare', depends_on: ['sensor-a', 'sensor-b'] },
          { id: 'verify', capability: 'verify.test', depends_on: ['infer'] },
        ],
      });
      assert(graph.layers.length === 3, `expected 3 layers, got ${graph.layers.length}`);
      assert(graph.layers[0].length === 2, 'independent evidence should be parallelized');
      assert(graph.layers[1][0] === 'infer', 'inference must wait for both evidence nodes');
      assert(graph.layers[2][0] === 'verify', 'verification must follow inference');
      return `layers=${JSON.stringify(graph.layers)}`;
    },
    { implication: 'AURA has a usable substrate for compositional planning, but this does not prove it can invent the right graph from a held-out task.' },
  ));

  cases.push(await capture(
    'AGI-02',
    'abstract-planning',
    'Cyclic or self-contradictory plans are rejected',
    async () => {
      let rejected = false;
      try {
        validateTaskGraph({
          objective: 'invalid cyclic plan',
          nodes: [
            { id: 'a', capability: 'x', depends_on: ['b'] },
            { id: 'b', capability: 'y', depends_on: ['a'] },
          ],
        });
      } catch (error) {
        rejected = /cycle/i.test(String(error?.message || error));
      }
      assert(rejected, 'cyclic graph was not rejected');
      return 'cycle detected and rejected';
    },
    { implication: 'Planning machinery enforces basic causal consistency.' },
  ));

  cases.push(await capture(
    'AGI-03',
    'tool-use',
    'Side-effecting tools are excluded without explicit permission',
    async () => {
      const tool = normalizeCapability({
        id: 'heldout.write',
        tags: ['heldout', 'write'],
        side_effects: true,
        trust: 0.95,
        observed_reliability: 0.95,
      });
      const blocked = scoreCapability(tool, {
        requiredTags: ['heldout'],
        allowSideEffects: false,
      });
      const allowed = scoreCapability(tool, {
        requiredTags: ['heldout'],
        allowSideEffects: true,
      });
      assert(blocked === -Infinity, 'side-effect tool should be blocked by default');
      assert(Number.isFinite(allowed), 'explicitly permitted tool should remain routable');
      return `blocked=${blocked}, allowed=${allowed}`;
    },
    { implication: 'Agency is bounded by a typed capability policy rather than unrestricted shell access.' },
  ));

  cases.push(await capture(
    'AGI-04',
    'tool-use',
    'Tool routing prefers reliability and latency over a weaker alternative',
    async () => {
      const strong = normalizeCapability({
        id: 'heldout.strong',
        tags: ['analysis'],
        trust: 0.90,
        observed_reliability: 0.94,
        latency_ms: 350,
      });
      const weak = normalizeCapability({
        id: 'heldout.weak',
        tags: ['analysis'],
        trust: 0.62,
        observed_reliability: 0.58,
        latency_ms: 4200,
      });
      const a = scoreCapability(strong, { requiredTags: ['analysis'] });
      const b = scoreCapability(weak, { requiredTags: ['analysis'] });
      assert(a > b, `strong tool score ${a} should exceed weak score ${b}`);
      return `strong=${a}, weak=${b}`;
    },
    { implication: 'AURA has adaptive capability selection primitives.' },
  ));

  cases.push(await capture(
    'AGI-05',
    'cost-governance',
    'Positive cost ceilings reject capabilities above budget',
    async () => {
      const free = normalizeCapability({
        id: 'heldout.free',
        tags: ['compute'],
        cost_microunits: 0,
        trust: 0.8,
      });
      const costly = normalizeCapability({
        id: 'heldout.costly',
        tags: ['compute'],
        cost_microunits: 200,
        trust: 0.9,
      });
      const freeScore = scoreCapability(free, {
        requiredTags: ['compute'],
        maxCostMicrounits: 100,
      });
      const costlyScore = scoreCapability(costly, {
        requiredTags: ['compute'],
        maxCostMicrounits: 100,
      });
      assert(Number.isFinite(freeScore), 'zero-cost capability was unexpectedly rejected');
      assert(costlyScore === -Infinity, 'over-budget capability was not rejected');
      return `free=${freeScore}, over_budget=${costlyScore}`;
    },
    { implication: 'Explicit nonzero budgets are enforced by Fabric routing.' },
  ));

  cases.push(await capture(
    'AGI-06',
    'cost-governance',
    'Zero-cost mode rejects nonzero-cost capabilities fail-closed',
    async () => {
      const costly = normalizeCapability({
        id: 'heldout.costly-zero-budget',
        tags: ['compute'],
        cost_microunits: 1,
        trust: 0.99,
        observed_reliability: 0.99,
      });
      const free = normalizeCapability({
        id: 'heldout.free-zero-budget',
        tags: ['compute'],
        cost_microunits: 0,
        trust: 0.62,
        observed_reliability: 0.62,
      });
      const costlyScore = scoreCapability(costly, {
        requiredTags: ['compute'],
        maxCostMicrounits: 0,
        zeroCostOnly: true,
      });
      const freeScore = scoreCapability(free, {
        requiredTags: ['compute'],
        maxCostMicrounits: 0,
        zeroCostOnly: true,
      });
      assert(costlyScore === -Infinity, 'positive-cost capability remains routable in zero-cost mode');
      assert(Number.isFinite(freeScore), 'free capability was rejected in zero-cost mode');

      const fabric = new CapabilityFabric();
      fabric.register(costly);
      fabric.register(free);
      const selected = fabric.select({ requiredTags: ['compute'] });
      assert(selected?.id !== costly.id, 'default zero-cost Fabric selected a paid capability');
      return `paid=${costlyScore}, free=${freeScore}, selected=${selected?.id || 'none'}`;
    },
    {
      severity: 'critical',
      implication: 'AURA_ZERO_COST_MODE is now enforced in the generic Fabric router, not only in provider-specific model code.',
    },
  ));

  cases.push(await capture(
    'AGI-07',
    'metacognition',
    'Novelty and risk trigger deeper computation',
    async () => {
      const engine = new ActiveInferenceEngine();
      const organism = {
        clarte: 0.78,
        stabilite: 0.82,
        intention_field: { potentials: { observe: 0.8, act: 0.2 } },
      };
      const easy = engine.assess(organism, { novelty: 0.02, risk: 0.02 });
      const hard = engine.assess(organism, { novelty: 1, risk: 1 });
      assert(
        tierRank(hard.compute_tier) > tierRank(easy.compute_tier),
        `hard tier ${hard.compute_tier} should exceed easy tier ${easy.compute_tier}`,
      );
      assert(hard.token_budget > easy.token_budget, 'hard task should receive more external reasoning budget');
      return `easy=${easy.compute_tier}/${easy.token_budget}, hard=${hard.compute_tier}/${hard.token_budget}`;
    },
    { implication: 'AURA can allocate more reasoning effort when uncertainty/risk rises.' },
  ));

  cases.push(await capture(
    'AGI-08',
    'learning',
    'Failure changes future inference policy instead of leaving it static',
    async () => {
      const learner = new NativePolicyLearner();
      const before = learner.defaultState();
      const after = learner.update(before, {
        ok: false,
        surprise: 0.9,
        risk: 0.8,
      });
      assert(after.observations === 1, 'learning observation was not recorded');
      assert(after.failures === 1, 'failure count was not recorded');
      assert(after.params.risk_weight > before.params.risk_weight, 'failure should increase risk sensitivity');
      assert(after.params.deep_threshold < before.params.deep_threshold, 'failure should trigger deep reasoning earlier');
      assert(after.params.confidence_bias < before.params.confidence_bias, 'failure should reduce confidence bias');
      return `risk_weight ${before.params.risk_weight}->${after.params.risk_weight}; deep_threshold ${before.params.deep_threshold}->${after.params.deep_threshold}`;
    },
    { implication: 'AURA contains outcome-driven policy adaptation, not only static prompting.' },
  ));

  cases.push(await capture(
    'AGI-09',
    'epistemics',
    'Current-world questions are routed toward external evidence',
    async () => {
      const current = [
        'Vérifie la version actuelle de cette API.',
        'Quels sont les concurrents récents sur ce marché ?',
        'Cherche la dernière mise à jour de cette technologie.',
      ];
      const timeless = [
        'Combien font deux plus deux ?',
        'Explique la différence entre une pile et une file.',
      ];
      assert(current.every((item) => requiresExternalKnowledge(item)), 'a current-world query escaped the evidence trigger');
      assert(timeless.every((item) => !requiresExternalKnowledge(item)), 'timeless query was incorrectly forced to external research');
      return 'current-world prompts require evidence; timeless prompts remain local';
    },
    { implication: 'The chat path has an explicit epistemic boundary between model priors and current facts.' },
  ));

  cases.push(await capture(
    'AGI-10',
    'resource-governance',
    'Task execution stops when cumulative cost exceeds an explicit budget',
    async () => {
      const calls = [];
      const fabric = {
        async execute(capability) {
          calls.push(capability);
          return {
            ok: true,
            result: { capability },
            metrics: { cost_microunits: 30 },
          };
        },
        async recordGraph() {},
        async recordNodeRun() {},
      };
      const executor = new TaskGraphExecutor(fabric);
      let rejected = false;
      try {
        await executor.execute({
          id: 'budget-heldout',
          objective: 'spend no more than 50',
          budget_microunits: 50,
          max_parallel: 1,
          nodes: [
            { id: 'one', capability: 'cap.one', depends_on: [] },
            { id: 'two', capability: 'cap.two', depends_on: ['one'] },
          ],
        });
      } catch (error) {
        rejected = /budget DAG dépassé/i.test(String(error?.message || error));
      }
      assert(rejected, 'cumulative DAG budget overflow was not rejected');
      assert(calls.length === 2, 'budget check should occur on measured execution cost');
      return `calls=${calls.join(',')}; second result caused cumulative budget rejection`;
    },
    { implication: 'Measured task cost can stop a plan before further layers execute.' },
  ));

  cases.push(await capture(
    'AGI-11',
    'self-correction',
    'Downstream actions do not continue blindly after an upstream failure',
    async () => {
      const calls = [];
      const fabric = {
        async execute(capability) {
          calls.push(capability);
          if (capability === 'cap.observe') throw new Error('held-out sensor failure');
          return { ok: true, result: {}, metrics: { cost_microunits: 0 } };
        },
        async recordGraph() {},
        async recordNodeRun() {},
      };
      const executor = new TaskGraphExecutor(fabric);
      const outcome = await executor.execute({
        id: 'failure-heldout',
        objective: 'do not act after failed evidence collection',
        nodes: [
          { id: 'observe', capability: 'cap.observe', depends_on: [] },
          { id: 'act', capability: 'cap.act', depends_on: ['observe'] },
        ],
      });
      assert(outcome.ok === false, 'graph should report failure');
      assert(calls.includes('cap.observe'), 'upstream capability was not attempted');
      assert(!calls.includes('cap.act'), 'downstream action ran after upstream failure');
      return `calls=${JSON.stringify(calls)}`;
    },
    { implication: 'The deterministic executor fails closed across dependency layers.' },
  ));

  cases.push(await capture(
    'AGI-12',
    'uncertainty',
    'Internal uncertainty metric distinguishes ambiguous from concentrated beliefs',
    async () => {
      const engine = new ActiveInferenceEngine();
      const ambiguous = engine.normalizedEntropy({ a: 0.5, b: 0.5 });
      const concentrated = engine.normalizedEntropy({ a: 0.99, b: 0.01 });
      assert(ambiguous > concentrated, `entropy should be higher for ambiguity: ${ambiguous} <= ${concentrated}`);
      return `ambiguous=${ambiguous.toFixed(4)}, concentrated=${concentrated.toFixed(4)}`;
    },
    { implication: 'AURA has a mathematical uncertainty signal, but semantic confidence calibration still needs live evaluation.' },
  ));

  cases.push(result(
    'AGI-13',
    'heldout-reasoning',
    'gap',
    'ARC-style held-out abstraction benchmark',
    'No official ARC-AGI-2/3 evaluation harness or held-out abstraction dataset is currently wired into AURA.',
    {
      severity: 'critical',
      implication: 'Generalization to genuinely novel abstract tasks is not demonstrated.',
    },
  ));

  cases.push(result(
    'AGI-14',
    'cross-domain-transfer',
    'unverified',
    'Semantic knowledge transfer across unrelated domains',
    'The native learner transfers global risk/compute policy, but there is no held-out test showing a learned semantic strategy in domain A improves a novel task in domain B.',
    {
      severity: 'critical',
      implication: 'Policy adaptation is real; broad conceptual transfer remains unproven.',
    },
  ));

  cases.push(await capture(
    'AGI-15',
    'persistent-memory',
    'Long-term memory survives restart and improves later performance',
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'aura-memory-benchmark-'));
      const memoryPath = path.join(root, 'capability-memory.json');
      try {
        const registerTools = (fabric) => {
          fabric.register({
            id: 'memory.primary',
            tags: ['memory-heldout'],
            trust: 0.80,
            observed_reliability: 0.80,
            semantic_reliability: 0.80,
            latency_ms: 40,
            cost_microunits: 0,
            side_effects: false,
          }, async () => {
            throw new Error('held-out persistent failure');
          });
          fabric.register({
            id: 'memory.backup',
            tags: ['memory-heldout'],
            trust: 0.77,
            observed_reliability: 0.77,
            semantic_reliability: 0.77,
            latency_ms: 80,
            cost_microunits: 0,
            side_effects: false,
          }, async () => ({
            ok: true,
            result: { recovered: true },
            metrics: { cost_microunits: 0 },
          }));
        };

        const persistence1 = new FileCapabilityMemory(memoryPath);
        const firstProcess = new CapabilityFabric({ persistence: persistence1 });
        registerTools(firstProcess);
        const initial = firstProcess.select({ requiredTags: ['memory-heldout'] });
        assert(initial?.id === 'memory.primary', 'first process did not start with primary');

        let attemptsBeforeRestart = 0;
        try {
          attemptsBeforeRestart += 1;
          await firstProcess.execute(initial.id, { attempt: attemptsBeforeRestart });
        } catch {}
        const recovered = firstProcess.select({ requiredTags: ['memory-heldout'] });
        assert(recovered?.id === 'memory.backup', 'first process did not learn from failure');
        attemptsBeforeRestart += 1;
        const recoveryOutcome = await firstProcess.execute(recovered.id, { attempt: attemptsBeforeRestart });
        assert(recoveryOutcome?.result?.recovered === true, 'first process recovery failed');

        const control = new CapabilityFabric();
        registerTools(control);
        const controlAfterFreshStart = control.select({ requiredTags: ['memory-heldout'] });
        assert(controlAfterFreshStart?.id === 'memory.primary',
          'fresh control unexpectedly knew the prior failure');

        const persistence2 = new FileCapabilityMemory(memoryPath);
        const restarted = new CapabilityFabric({ persistence: persistence2 });
        registerTools(restarted);
        const hydrated = await restarted.hydrate();
        assert(hydrated?.restored >= 2, 'restart did not restore learned capability state');
        const selectedAfterRestart = restarted.select({ requiredTags: ['memory-heldout'] });
        assert(selectedAfterRestart?.id === 'memory.backup',
          'restarted AURA forgot the successful recovery route');
        const afterRestartOutcome = await restarted.execute(
          selectedAfterRestart.id,
          { attempt: 1, after_restart: true },
        );
        assert(afterRestartOutcome?.result?.recovered === true,
          'restarted process did not succeed from persisted memory');

        const primaryRestored = restarted.list({ includeDisabled: true })
          .find((item) => item.id === 'memory.primary');
        assert(Number(primaryRestored?.observed_reliability || 1) < 0.80,
          'learned primary failure reliability was not restored');

        return 'before_restart_attempts=' + attemptsBeforeRestart
          + '; fresh_control=' + controlAfterFreshStart.id
          + '; after_restart_first_choice=' + selectedAfterRestart.id
          + '; after_restart_attempts=1'
          + '; restored_primary_reliability='
          + Number(primaryRestored?.observed_reliability || 0).toFixed(4);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    {
      severity: 'high',
      implication: 'A learned tool preference survives process reconstruction and reduces the attempts required on the next run.',
    },
  ));

  cases.push(result(
    'AGI-16',
    'long-horizon-agency',
    'unverified',
    'Multi-hour mission completion with replanning and recovery',
    'LongHorizonMissionEngine implements retries, critic-driven replanning and mission lessons, but no held-out multi-hour mission is yet scored end-to-end in CI.',
    {
      severity: 'critical',
      implication: 'Long-horizon architecture is present; robust autonomous completion is not demonstrated.',
    },
  ));

  cases.push(result(
    'AGI-17',
    'open-world-tool-use',
    'unverified',
    'GAIA-style multi-tool task completion in the open world',
    'AURA exposes Web Substrate, typed capabilities, browser/runtime bridges and DAG execution, but there is no hidden task set with exact-answer or outcome-based scoring.',
    {
      severity: 'critical',
      implication: 'Tool breadth is substantial but general tool competence is not benchmarked.',
    },
  ));

  cases.push(await capture(
    'AGI-18',
    'self-improvement',
    'Held-out software repair improves code without regression',
    async () => {
      const seedText = String(process.env.AURA_BLIND_SEED || process.env.GITHUB_SHA || 'aura-repair-seed');
      let seed = 2166136261;
      for (const char of seedText) {
        seed ^= char.charCodeAt(0);
        seed = Math.imul(seed, 16777619) >>> 0;
      }
      const family = seed % 4;
      const fixtures = [
        {
          name: 'arithmetic-operator',
          source: 'export function adjust(x) { return x - 7; }\n',
          test: "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { adjust } from './subject.mjs';\ntest('adjust',()=>{ assert.equal(adjust(1),8); assert.equal(adjust(5),12); });\n",
        },
        {
          name: 'comparison-boundary',
          source: 'export function eligible(score) { return score > 10; }\n',
          test: "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { eligible } from './subject.mjs';\ntest('eligible',()=>{ assert.equal(eligible(10),true); assert.equal(eligible(9),false); assert.equal(eligible(11),true); });\n",
        },
        {
          name: 'boolean-composition',
          source: 'export function allowed(isAdmin, isOwner) { return isAdmin && isOwner; }\n',
          test: "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { allowed } from './subject.mjs';\ntest('allowed',()=>{ assert.equal(allowed(true,false),true); assert.equal(allowed(false,true),true); assert.equal(allowed(false,false),false); });\n",
        },
        {
          name: 'numeric-off-by-one',
          source: 'export function nextIndex(index) { return index + 2; }\n',
          test: "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { nextIndex } from './subject.mjs';\ntest('nextIndex',()=>{ assert.equal(nextIndex(0),1); assert.equal(nextIndex(9),10); });\n",
        },
      ];
      const fixture = fixtures[family];
      const root = await mkdtemp(path.join(tmpdir(), 'aura-repair-benchmark-'));
      try {
        await writeFile(path.join(root, 'subject.mjs'), fixture.source, 'utf8');
        await writeFile(path.join(root, 'subject.test.mjs'), fixture.test, 'utf8');

        const engine = new SoftwareRepairEngine({
          workspaceRoot: root,
          timeoutMs: 4000,
          maxCandidates: 120,
        });
        const outcome = await engine.repair({
          sourceFile: 'subject.mjs',
          testFile: 'subject.test.mjs',
        });
        assert(outcome?.baseline?.pass === false, 'blind repair fixture unexpectedly passed before repair');
        assert(outcome?.repaired === true, 'repair engine did not find a regression-free patch');
        assert(outcome?.validation?.pass === true, 'candidate did not pass validation');
        assert(outcome?.confirmation?.pass === true, 'candidate did not pass confirmation rerun');
        assert(outcome.original_sha256 !== outcome.final_sha256, 'repair did not change source');

        const independentVerifier = new SoftwareRepairEngine({
          workspaceRoot: root,
          timeoutMs: 4000,
        });
        const finalCheck = await independentVerifier.validate('subject.test.mjs');
        assert(finalCheck.pass === true, 'independent post-repair verification failed');

        return 'seed=' + seed
          + '; family=' + fixture.name
          + '; attempts=' + outcome.attempts
          + '; patch=' + outcome.candidate_kind + ':' + outcome.candidate_detail
          + '; validation=pass; confirmation=pass; independent=pass';
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    {
      severity: 'high',
      implication: 'AURA now demonstrates bounded blind repair across runtime-selected mutation families with test-gated acceptance; this is still narrower than SWE-bench-scale software engineering.',
    },
  ));


  cases.push(await capture(
    'AGI-19',
    'epistemics',
    'Conflicting independent evidence remains explicitly contested',
    async () => {
      const aggregate = aggregateEvidence([
        { stance: 'support', independent_key: 'a', reliability: 0.88, relevance: 0.95 },
        { stance: 'support', independent_key: 'b', reliability: 0.84, relevance: 0.92 },
        { stance: 'contradict', independent_key: 'c', reliability: 0.95, relevance: 0.98 },
      ]);
      assert(aggregate.epistemic_status === 'contested', `expected contested, got ${aggregate.epistemic_status}`);
      assert(aggregate.independent_contradicting_sources === 1, 'contradicting source was not counted');
      return `status=${aggregate.epistemic_status}, confidence=${aggregate.confidence}, contradiction=${aggregate.weighted_contradiction}`;
    },
    {
      severity: 'high',
      implication: 'The evidence layer does not erase a strong contradiction merely because two sources support the claim.',
    },
  ));

  cases.push(await capture(
    'AGI-20',
    'epistemic-agency',
    'Unconfirmed world signals cannot authorize autonomous action',
    async () => {
      let unsafeRejected = false;
      try {
        validateHorizonSignal({
          signal_id: 'heldout-unsafe',
          aura_event: 'horizon.world.emerging',
          payload: {
            epistemic_status: 'confirmed',
            autonomy_hint: 'act_now',
          },
        });
      } catch {
        unsafeRejected = true;
      }
      assert(unsafeRejected, 'unsafe emerging signal was accepted');

      validateHorizonSignal({
        signal_id: 'heldout-safe',
        aura_event: 'horizon.world.emerging',
        payload: {
          epistemic_status: 'unconfirmed_emerging_event',
          autonomy_hint: 'notify_or_verify_only',
        },
      });
      return 'unsafe action hint rejected; verify-only signal accepted';
    },
    {
      severity: 'critical',
      implication: 'Epistemic uncertainty is tied to an action boundary, not only to confidence text.',
    },
  ));

  cases.push(await capture(
    'AGI-21',
    'heldout-reasoning',
    'Native cognition solves an unseen symbolic rule without an external semantic model',
    async () => {
      const cognition = new CognitionEngine();
      const puzzle = 'Règle inconnue KAL. f(2)=5, f(4)=9, f(6)=13. Sans recherche externe, déduis f(9) et explique la règle.';
      const plan = cognition.planReply({
        text: puzzle,
        soul: { current_intention: 'résoudre', dominant_thought: '', organism: {} },
        intentions: [],
        lessons: [],
        reflections: [],
        work: [],
        recentMessages: [],
        privateView: true,
      });
      const answer = cognition.deterministicReply(plan);
      const solved = /(?:^|\D)19(?:\D|$)/.test(answer)
        && /2\s*[*×x]\s*n|2n|double/i.test(answer);
      if (!solved) {
        return {
          status: 'gap',
          severity: 'critical',
          evidence: `needs_semantic_support=${Boolean(plan.needs_semantic_support)}; native_answer=${answer}`,
          implication: 'The persistent native core does not yet demonstrate general abstract reasoning independently of an external semantic model.',
        };
      }
      return `native_answer=${answer}`;
    },
  ));

  cases.push(await capture(
    'AGI-22',
    'heldout-planning',
    'Native planner composes unfamiliar capabilities without an LLM',
    async () => {
      const compiler = new DagCompiler({ enabled: false });
      const graph = await compiler.compile(
        'Stabiliser un registre Zephyr inconnu, vérifier son état puis produire une transformation réversible.',
        [
          { id: 'web.research', tags: ['research'], side_effects: false, trust: 0.9, cost_microunits: 0 },
          { id: 'zephyr.transform', tags: ['transform'], side_effects: false, trust: 0.8, cost_microunits: 0 },
        ],
      );
      const composed = graph.nodes.length >= 2
        && graph.nodes.some((node) => node.capability === 'zephyr.transform');
      if (!composed) {
        return {
          status: 'gap',
          severity: 'critical',
          evidence: `nodes=${JSON.stringify(graph.nodes)}`,
          implication: 'Without a semantic model, the DAG compiler falls back to research rather than inventing a general multi-step plan.',
        };
      }
      return `nodes=${JSON.stringify(graph.nodes)}`;
    },
  ));

  cases.push(await capture(
    'AGI-23',
    'autonomy',
    'Cloud AURA executes a novel external action when local Runtime is absent',
    async () => {
      const fabric = new CapabilityFabric();
      const kernel = new CognitiveKernel(
        { enabled: false, async generate() { return ''; } },
        null,
        { enabled: false, async workerOnline() { return false; } },
        null,
        fabric,
      );
      kernel.runAgent = async () => ({ agent: 'operator', answer: 'Plan réversible uniquement.' });
      kernel.trace = async () => {};
      const outcome = await kernel.operate(
        'Créer un fichier de test, relire son contenu, puis le supprimer.',
        ['safe'],
      );
      const results = outcome?.result?.results || {};
      const rows = Object.values(results);
      const created = rows.find((row) => row.capability === 'cloud.workspace.create')?.result;
      const read = rows.find((row) => row.capability === 'cloud.workspace.read')?.result;
      const deleted = rows.find((row) => row.capability === 'cloud.workspace.delete')?.result;
      const verified = outcome.executed
        && outcome.execution_mode === 'aura-cloud-sandbox'
        && created?.created === true
        && read?.read === true
        && created?.sha256 === read?.sha256
        && deleted?.deleted === true
        && deleted?.exists_after === false;
      if (!verified) {
        return {
          status: 'gap',
          severity: 'critical',
          evidence: `execution_mode=${outcome.execution_mode}; executed=${outcome.executed}; authority=${outcome.authority}; results=${JSON.stringify(results)}`,
          implication: 'Cloud-only agency remains incomplete if a typed reversible workspace mission cannot be executed and verified without Quantic Studio.',
        };
      }
      return `execution_mode=${outcome.execution_mode}; create/read hash=${created.sha256.slice(0,12)}; deleted=${deleted.deleted}; residue=${deleted.exists_after}`;
    },
  ));

  cases.push(await capture(
    'AGI-24',
    'swarm',
    'Agent swarm performs concurrent work rather than sequential role calls',
    async () => {
      const kernel = new CognitiveKernel(
        { enabled: true, async generate() { return 'synthesis'; } },
        null,
        null,
      );
      let active = 0;
      let maxActive = 0;
      kernel.trace = async () => {};
      kernel.runAgent = async (name) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 12));
        active -= 1;
        return { agent: name, answer: name };
      };
      await kernel.swarm('held-out concurrent mission', ['planner','research','dev','critic']);
      if (maxActive <= 1) {
        return {
          status: 'gap',
          severity: 'medium',
          evidence: `max_concurrent_agents=${maxActive}`,
          implication: 'The current kernel swarm aggregates multiple roles but executes them sequentially on this path.',
        };
      }
      return `max_concurrent_agents=${maxActive}`;
    },
  ));


  cases.push(await capture(
    'AGI-25',
    'blind-generalization',
    'Unseen parameterized rule family is solved without a prewritten AURA rule',
    async () => {
      const seedText = String(process.env.AURA_BLIND_SEED || process.env.GITHUB_SHA || 'aura-local-blind-seed');
      let seed = 2166136261;
      for (const char of seedText) {
        seed ^= char.charCodeAt(0);
        seed = Math.imul(seed, 16777619) >>> 0;
      }
      const degree = (seed >>> 3) % 2 === 0 ? 1 : 2;
      const a = 1 + (seed % 4);
      const b = ((seed >>> 5) % 7) - 2;
      const c0 = 1 + ((seed >>> 9) % 8);
      const target = 9 + ((seed >>> 13) % 7);
      const evaluate = degree === 1
        ? (x) => a * x + c0
        : (x) => a * x * x + b * x + c0;
      const examples = [1, 3, 5, 7].map((x) => [x, evaluate(x)]);
      const expected = evaluate(target);
      const puzzle = [
        'Règle aveugle ZEPHYR-' + String(seed % 100000) + '.',
        'La famille de règle et ses coefficients sont choisis au moment du run et ne sont pas connus d’AURA à l’avance.',
        examples.map(([x, y]) => 'f(' + x + ')=' + y).join(', ') + '.',
        'Sans recherche externe, déduis f(' + target + ') et explique la règle la plus simple compatible avec tous les exemples.',
      ].join(' ');

      const cognition = new CognitionEngine();
      const plan = cognition.planReply({
        text: puzzle,
        soul: { current_intention: 'résoudre', dominant_thought: '', organism: {} },
        intentions: [], lessons: [], reflections: [], work: [], recentMessages: [], privateView: true,
      });
      const answer = cognition.deterministicReply(plan);
      const valueRegex = new RegExp(
        'f\\s*\\(\\s*' + target + '\\s*\\)\\s*=\\s*' + expected + '(?:\\D|$)',
        'i',
      );
      const structuralEvidence = degree === 1
        ? /f\(n\)\s*=.*\*n/i.test(answer)
        : /f\(n\)\s*=.*n\^2/i.test(answer);
      const solved = plan.needs_semantic_support === false
        && valueRegex.test(answer)
        && structuralEvidence;
      if (!solved) {
        return {
          status: 'gap',
          severity: 'critical',
          evidence: 'seed=' + seed + '; degree=' + degree + '; expected=f(' + target + ')=' + expected
            + '; needs_semantic_support=' + Boolean(plan.needs_semantic_support)
            + '; native_answer=' + answer,
          implication: 'The native core still fails a rule family selected at runtime rather than one embedded in AURA.',
        };
      }
      return 'seed=' + seed + '; degree=' + degree + '; solved=f(' + target + ')=' + expected + '; answer=' + answer;
    },
  ));

  cases.push(await capture(
    'AGI-26',
    'mid-mission-adaptation',
    'A tool removed after mission start is replaced before the next step',
    async () => {
      const fabric = new CapabilityFabric();
      fabric.register({
        id: 'blind.route.alpha',
        tags: ['blind-route'],
        trust: 0.84,
        observed_reliability: 0.84,
        latency_ms: 40,
        cost_microunits: 0,
        side_effects: false,
      }, async () => ({ ok: true, result: { route: 'alpha' }, metrics: { cost_microunits: 0 } }));
      fabric.register({
        id: 'blind.route.beta',
        tags: ['blind-route'],
        trust: 0.79,
        observed_reliability: 0.79,
        latency_ms: 70,
        cost_microunits: 0,
        side_effects: false,
      }, async () => ({ ok: true, result: { route: 'beta' }, metrics: { cost_microunits: 0 } }));

      const first = fabric.select({ requiredTags: ['blind-route'] });
      assert(first?.id === 'blind.route.alpha', 'unexpected initial route');
      await fabric.execute(first.id, { stage: 1 });

      fabric.register({ ...first, enabled: false });
      const second = fabric.select({ requiredTags: ['blind-route'] });
      assert(second?.id === 'blind.route.beta', 'AURA kept the disabled tool after the condition changed');
      const outcome = await fabric.execute(second.id, { stage: 2 });
      assert(outcome?.ok !== false, 'replacement tool did not complete stage 2');
      return 'stage1=' + first.id + '; condition_change=alpha_disabled; stage2=' + second.id;
    },
    {
      implication: 'Dynamic capability routing reacts to a mid-mission outage, although this alone is not semantic replanning of the whole objective.',
    },
  ));

  cases.push(await capture(
    'AGI-27',
    'behavioral-learning',
    'A failed tool changes routing and the second attempt succeeds with an alternative',
    async () => {
      const fabric = new CapabilityFabric();
      fabric.register({
        id: 'blind.learn.primary',
        tags: ['blind-recovery'],
        trust: 0.80,
        observed_reliability: 0.80,
        latency_ms: 50,
        cost_microunits: 0,
        side_effects: false,
      }, async () => {
        throw new Error('blind injected outage');
      });
      fabric.register({
        id: 'blind.learn.backup',
        tags: ['blind-recovery'],
        trust: 0.77,
        observed_reliability: 0.77,
        latency_ms: 100,
        cost_microunits: 0,
        side_effects: false,
      }, async () => ({
        ok: true,
        result: { recovered: true },
        metrics: { cost_microunits: 0 },
      }));

      const first = fabric.select({ requiredTags: ['blind-recovery'] });
      assert(first?.id === 'blind.learn.primary', 'primary tool was not selected on attempt 1');
      let firstSucceeded = true;
      try {
        await fabric.execute(first.id, { attempt: 1 });
      } catch {
        firstSucceeded = false;
      }
      assert(!firstSucceeded, 'attempt 1 unexpectedly succeeded');

      const primaryAfter = fabric.list({ includeDisabled: true })
        .find((item) => item.id === 'blind.learn.primary');
      const second = fabric.select({ requiredTags: ['blind-recovery'] });
      assert(second?.id === 'blind.learn.backup',
        'routing did not change after the observed failure');
      const secondOutcome = await fabric.execute(second.id, { attempt: 2 });
      assert(secondOutcome?.ok !== false && secondOutcome?.result?.recovered === true,
        'attempt 2 did not recover');
      return 'attempt1=' + first.id + ':fail; learned_reliability='
        + Number(primaryAfter?.observed_reliability || 0).toFixed(4)
        + '; attempt2=' + second.id + ':success';
    },
    {
      severity: 'high',
      implication: 'This is a genuine first-attempt/second-attempt behavioral improvement driven by an observed outcome.',
    },
  ));

  cases.push(await capture(
    'AGI-28',
    'contradiction-adaptation',
    'Contradictory evidence introduced mid-task changes the epistemic state',
    async () => {
      const initialEvidence = [
        { stance: 'support', independent_key: 'blind-a', reliability: 0.88, relevance: 0.95 },
        { stance: 'support', independent_key: 'blind-b', reliability: 0.84, relevance: 0.92 },
      ];
      const before = aggregateEvidence(initialEvidence);
      const after = aggregateEvidence(initialEvidence.concat([
        { stance: 'contradict', independent_key: 'blind-c', reliability: 0.97, relevance: 0.99 },
      ]));
      assert(after.epistemic_status === 'contested',
        'strong contradictory evidence did not make the state contested');
      assert(Number(after.independent_contradicting_sources || 0) === 1,
        'contradictory source was not retained');
      assert(Number(after.weighted_contradiction || 0) > Number(before.weighted_contradiction || 0),
        'contradiction signal did not increase');
      return 'before=' + before.epistemic_status + '; after=' + after.epistemic_status
        + '; contradiction=' + after.weighted_contradiction;
    },
    {
      severity: 'high',
      implication: 'AURA revises its epistemic state when a high-quality contradiction arrives after initial supporting evidence.',
    },
  ));

  cases.push(await capture(
    'AGI-29',
    'semantic-error-learning',
    'A plausible but wrong tool result is detected and avoided on the second attempt',
    async () => {
      const fabric = new CapabilityFabric();
      fabric.register({
        id: 'blind.semantic.primary',
        tags: ['blind-semantic'],
        trust: 0.84,
        observed_reliability: 0.84,
        latency_ms: 40,
        cost_microunits: 0,
        side_effects: false,
      }, async () => ({
        ok: true,
        result: { answer: 'ORANGE' },
        metrics: { cost_microunits: 0 },
      }));
      fabric.register({
        id: 'blind.semantic.backup',
        tags: ['blind-semantic'],
        trust: 0.79,
        observed_reliability: 0.79,
        latency_ms: 80,
        cost_microunits: 0,
        side_effects: false,
      }, async () => ({
        ok: true,
        result: { answer: 'BLUE' },
        metrics: { cost_microunits: 0 },
      }));

      const first = fabric.select({ requiredTags: ['blind-semantic'] });
      assert(first?.id === 'blind.semantic.primary', 'unexpected semantic primary');
      const firstOutcome = await fabric.execute(first.id, { attempt: 1 });
      assert(firstOutcome?.result?.answer === 'ORANGE', 'blind semantic fixture changed');

      const evidence = aggregateEvidence([
        { stance: 'support', independent_key: 'primary-output', reliability: 0.72, relevance: 0.95 },
        { stance: 'contradict', independent_key: 'independent-check', reliability: 0.98, relevance: 1.0 },
      ]);
      assert(evidence.epistemic_status === 'contested', 'semantic contradiction was not surfaced');

      const semanticFeedback = await fabric.applyVerificationFeedback(first.id, {
        target: 'capability-output',
        ...evidence,
        verifier_confidence: 0.98,
        reason: 'Independent evidence outweighs the primary tool output.',
      });
      assert(semanticFeedback?.applied === true, 'semantic contradiction was not learned');
      assert(Number(semanticFeedback.after) < Number(semanticFeedback.before),
        'semantic reliability did not decrease');

      const second = fabric.select({ requiredTags: ['blind-semantic'] });
      assert(second?.id === 'blind.semantic.backup',
        'AURA did not avoid the semantically contradicted tool on attempt 2');
      const secondOutcome = await fabric.execute(second.id, { attempt: 2 });
      assert(secondOutcome?.result?.answer === 'BLUE', 'attempt 2 did not recover the verified answer');

      return 'attempt1=' + first.id + ':plausible-but-wrong; contradiction='
        + evidence.epistemic_status + '; semantic_reliability='
        + semanticFeedback.before + '->' + semanticFeedback.after
        + '; attempt2=' + second.id + ':success';
    },
  ));

  const counts = {
    pass: cases.filter((item) => item.status === 'pass').length,
    fail: cases.filter((item) => item.status === 'fail').length,
    gap: cases.filter((item) => item.status === 'gap').length,
    unverified: cases.filter((item) => item.status === 'unverified').length,
  };

  return {
    schema: 'aura-agi-battery-v1',
    generated_at: new Date().toISOString(),
    purpose: 'Measure AGI-relevant capabilities without treating architecture or a single aggregate score as proof of AGI.',
    cases,
    counts,
    behavioral_blind: {
      total: cases.filter((item) => ['AGI-25','AGI-26','AGI-27','AGI-28','AGI-29'].includes(item.id)).length,
      pass: cases.filter((item) => ['AGI-25','AGI-26','AGI-27','AGI-28','AGI-29'].includes(item.id) && item.status === 'pass').length,
      gap: cases.filter((item) => ['AGI-25','AGI-26','AGI-27','AGI-28','AGI-29'].includes(item.id) && item.status === 'gap').length,
      second_attempt_improvement: cases.find((item) => item.id === 'AGI-27')?.status === 'pass',
      autonomous_semantic_error_learning: cases.find((item) => item.id === 'AGI-29')?.status === 'pass',
    },
    deterministic_regression_free: counts.fail === 0,
    agi_demonstrated: false,
    agi_claim_reason: counts.gap || counts.unverified
      ? 'Held-out generalization, cross-domain transfer, long-horizon completion and open-world tool competence remain incomplete or unverified.'
      : 'A deterministic substrate battery alone cannot establish AGI.',
  };
}
