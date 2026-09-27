import { ActiveInferenceEngine } from './active_inference.js';
import { NativePolicyLearner } from './native_learning.js';
import { normalizeCapability, scoreCapability } from './capability_fabric.js';
import { TaskGraphExecutor, validateTaskGraph } from './task_graph.js';
import { requiresExternalKnowledge } from './kernel.js';

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
    'Zero-cost semantics are unambiguous in the Capability Fabric',
    async () => {
      const costly = normalizeCapability({
        id: 'heldout.costly-zero-budget',
        tags: ['compute'],
        cost_microunits: 1,
        trust: 0.95,
      });
      const score = scoreCapability(costly, {
        requiredTags: ['compute'],
        maxCostMicrounits: 0,
      });
      if (Number.isFinite(score)) {
        return {
          status: 'gap',
          severity: 'high',
          evidence: `maxCostMicrounits=0 still yields routable score=${score}; zero currently means "no ceiling", not "free only".`,
          implication: 'AURA_ZERO_COST_MODE is enforced in other layers, but Fabric itself does not encode a fail-closed zero-cost invariant.',
        };
      }
      return 'zero budget rejects nonzero-cost capability';
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
    'ARC-style held-out abstraction benchmark',
    'gap',
    'No official ARC-AGI-2/3 evaluation harness or held-out abstraction dataset is currently wired into AURA.',
    {
      severity: 'critical',
      implication: 'Generalization to genuinely novel abstract tasks is not demonstrated.',
    },
  ));

  cases.push(result(
    'AGI-14',
    'cross-domain-transfer',
    'Semantic knowledge transfer across unrelated domains',
    'unverified',
    'The native learner transfers global risk/compute policy, but there is no held-out test showing a learned semantic strategy in domain A improves a novel task in domain B.',
    {
      severity: 'critical',
      implication: 'Policy adaptation is real; broad conceptual transfer remains unproven.',
    },
  ));

  cases.push(result(
    'AGI-15',
    'persistent-memory',
    'Long-term memory survives restart and improves later performance',
    'unverified',
    'Persistent lessons, intentions, outcomes and soul state exist in MySQL, but the current deterministic battery does not restart a production-like database and measure behavioral improvement after recall.',
    {
      severity: 'high',
      implication: 'Persistence exists architecturally, but beneficial memory use needs an end-to-end benchmark.',
    },
  ));

  cases.push(result(
    'AGI-16',
    'long-horizon-agency',
    'Multi-hour mission completion with replanning and recovery',
    'unverified',
    'LongHorizonMissionEngine implements retries, critic-driven replanning and mission lessons, but no held-out multi-hour mission is yet scored end-to-end in CI.',
    {
      severity: 'critical',
      implication: 'Long-horizon architecture is present; robust autonomous completion is not demonstrated.',
    },
  ));

  cases.push(result(
    'AGI-17',
    'open-world-tool-use',
    'GAIA-style multi-tool task completion in the open world',
    'unverified',
    'AURA exposes Web Substrate, typed capabilities, browser/runtime bridges and DAG execution, but there is no hidden task set with exact-answer or outcome-based scoring.',
    {
      severity: 'critical',
      implication: 'Tool breadth is substantial but general tool competence is not benchmarked.',
    },
  ));

  cases.push(result(
    'AGI-18',
    'self-improvement',
    'Held-out software repair improves AURA without regression',
    'unverified',
    'Evolution and Director Mode can diagnose CI failures and prepare changes behind CI/canary gates, but there is no blind repository-repair benchmark comparable to a SWE-bench-style evaluation.',
    {
      severity: 'high',
      implication: 'Self-repair machinery exists, but autonomous software-engineering generality is unproven.',
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
    deterministic_regression_free: counts.fail === 0,
    agi_demonstrated: false,
    agi_claim_reason: counts.gap || counts.unverified
      ? 'Held-out generalization, cross-domain transfer, persistent-memory benefit, long-horizon completion and open-world tool competence remain incomplete or unverified.'
      : 'A deterministic substrate battery alone cannot establish AGI.',
  };
}
