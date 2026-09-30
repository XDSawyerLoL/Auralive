const clamp = (value, low = 0, high = 1) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return low;
  return Math.max(low, Math.min(high, n));
};

const clean = (value, max = 600) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

function requirementSet(candidate = {}) {
  const raw = candidate.required_capabilities || candidate.requires || candidate.capabilities || [];
  return new Set((Array.isArray(raw) ? raw : [raw]).map((x) => clean(x, 100)).filter(Boolean));
}

function strategySignature(candidate = {}) {
  return clean(candidate.strategy_signature || candidate.signature || candidate.id || candidate.title, 180).toLowerCase();
}

export class AdaptiveAutonomyPolicy {
  static VERSION = 'aura-adaptive-autonomy-policy-v1';

  constructor() {
    this.state = {
      attempts: 0,
      successes: 0,
      failures: 0,
      failed_strategies: {},
      contradicted_strategies: {},
      last_selection: '',
      last_reason: '',
    };
  }

  snapshot() {
    return structuredClone(this.state);
  }

  restore(candidate = {}) {
    const state = candidate && typeof candidate === 'object' ? structuredClone(candidate) : {};
    this.state = {
      attempts: Math.max(0, Number(state.attempts || 0)),
      successes: Math.max(0, Number(state.successes || 0)),
      failures: Math.max(0, Number(state.failures || 0)),
      failed_strategies: { ...(state.failed_strategies || {}) },
      contradicted_strategies: { ...(state.contradicted_strategies || {}) },
      last_selection: clean(state.last_selection, 180),
      last_reason: clean(state.last_reason, 700),
    };
    return this.snapshot();
  }

  observeOutcome(candidate = {}, { ok = false, contradiction = false, signature = '' } = {}) {
    const key = strategySignature(candidate);
    this.state.attempts += 1;
    if (ok) this.state.successes += 1;
    else this.state.failures += 1;
    if (!ok && key) {
      this.state.failed_strategies[key] = Math.max(
        1,
        Number(this.state.failed_strategies[key] || 0) + 1,
      );
    }
    if (contradiction && key) {
      this.state.contradicted_strategies[key] = Math.max(
        1,
        Number(this.state.contradicted_strategies[key] || 0) + 1,
      );
    }
    if (signature && !ok) {
      const sigKey = clean(signature, 180).toLowerCase();
      if (sigKey) this.state.failed_strategies[sigKey] = Math.max(
        1,
        Number(this.state.failed_strategies[sigKey] || 0) + 1,
      );
    }
    return this.snapshot();
  }

  evaluate(candidate = {}, {
    available_capabilities = [],
    blocked_capabilities = [],
    evidence = [],
    prior_lessons = [],
  } = {}) {
    const available = new Set((available_capabilities || []).map((x) => clean(x, 100)).filter(Boolean));
    const blocked = new Set((blocked_capabilities || []).map((x) => clean(x, 100)).filter(Boolean));
    const required = requirementSet(candidate);
    const missing = [...required].filter((cap) => blocked.has(cap) || (available.size > 0 && !available.has(cap)));

    const key = strategySignature(candidate);
    const priorFailures = Number(this.state.failed_strategies[key] || 0);
    const priorContradictions = Number(this.state.contradicted_strategies[key] || 0);

    let supportive = 0;
    let contradictory = 0;
    for (const row of Array.isArray(evidence) ? evidence : []) {
      const relates = !row?.strategy || clean(row.strategy, 180).toLowerCase() === key;
      if (!relates) continue;
      const confidence = clamp(row?.confidence ?? 0.5);
      if (row?.supports === false || row?.contradicts === true) contradictory += confidence;
      else if (row?.supports === true) supportive += confidence;
    }

    const lessonPenalty = (Array.isArray(prior_lessons) ? prior_lessons : [])
      .filter((lesson) => {
        const t = clean(lesson?.strategy || lesson?.signature || lesson?.content, 600).toLowerCase();
        return key && t.includes(key);
      }).length;

    const confidence = clamp(candidate.confidence ?? 0.5);
    const priority = clamp(candidate.priority ?? candidate.expected_value ?? 0.5);
    const infoGain = clamp(candidate.information_gain ?? candidate.novelty ?? 0.35);
    const reversible = candidate.reversible === false ? 0 : 1;
    const risk = clamp(candidate.risk ?? 0.25);

    let score =
      priority * 0.32
      + confidence * 0.20
      + infoGain * 0.18
      + reversible * 0.12
      + Math.min(1, supportive) * 0.12
      - risk * 0.20
      - Math.min(0.42, priorFailures * 0.14)
      - Math.min(0.36, priorContradictions * 0.18)
      - Math.min(0.30, contradictionPenalty(contradictory, supportive))
      - Math.min(0.30, lessonPenalty * 0.10);

    if (missing.length) score -= 1;
    score = Number(score.toFixed(4));

    return {
      candidate,
      score,
      viable: missing.length === 0 && score > -0.1,
      missing_capabilities: missing,
      prior_failures: priorFailures,
      contradiction_weight: Number(contradictory.toFixed(4)),
      support_weight: Number(supportive.toFixed(4)),
      strategy_signature: key,
    };
  }

  select(candidates = [], context = {}) {
    const evaluated = (Array.isArray(candidates) ? candidates : [])
      .map((candidate) => this.evaluate(candidate, context))
      .sort((a, b) => b.score - a.score);

    const selected = evaluated.find((row) => row.viable) || null;
    this.state.last_selection = selected ? strategySignature(selected.candidate) : '';
    this.state.last_reason = selected
      ? `selected score=${selected.score}; failures=${selected.prior_failures}; contradiction=${selected.contradiction_weight}`
      : 'no viable candidate';

    return {
      selected: selected?.candidate || null,
      selected_evaluation: selected,
      evaluated,
      policy_state: this.snapshot(),
    };
  }
}

function contradictionPenalty(contradictory, supportive) {
  const net = Math.max(0, Number(contradictory || 0) - Number(supportive || 0) * 0.45);
  return Math.min(1, net);
}
