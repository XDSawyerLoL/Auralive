function clamp(value, low = 0, high = 1) {
  return Math.max(low, Math.min(high, Number(value || 0)));
}

export class ActiveInferenceEngine {
  static VERSION = 'aura-active-inference-v1.2';

  softmax(values, temperature = 0.18) {
    if (!values.length) return [];
    const t = Math.max(0.03, Number(temperature));
    const peak = Math.max(...values);
    const exps = values.map((value) => Math.exp((value - peak) / t));
    const total = exps.reduce((sum, value) => sum + value, 0) || 1;
    return exps.map((value) => value / total);
  }

  normalizedEntropy(potentials = {}) {
    const values = Object.values(potentials)
      .map(Number)
      .filter(Number.isFinite);
    if (values.length <= 1) return 0;
    const probs = this.softmax(values);
    const entropy = -probs.reduce(
      (sum, p) => sum + p * Math.log(Math.max(p, 1e-12)),
      0,
    );
    const maximum = Math.log(probs.length);
    return clamp(maximum ? entropy / maximum : 0);
  }

  surprise(priorProbability) {
    const probability = Math.max(1e-9, Math.min(1, Number(priorProbability || 0)));
    return clamp(-Math.log(probability) / 7);
  }

  informationGain(posterior = {}, prior = {}) {
    const keys = new Set([...Object.keys(posterior), ...Object.keys(prior)]);
    let total = 0;
    for (const key of keys) {
      const p = Math.max(1e-9, Number(posterior[key] ?? 1e-9));
      const q = Math.max(1e-9, Number(prior[key] ?? 1e-9));
      total += p * Math.log(p / q);
    }
    return clamp(total / 6);
  }

  scorePlan({
    value = 0,
    informationGain = 0,
    coherence = 0,
    risk = 0,
    computeCost = 0,
    alpha = 0.35,
    beta = 0.30,
    gamma = 0.55,
    delta = 0.25,
  } = {}) {
    return Number((
      Number(value)
      + alpha * Number(informationGain)
      + beta * Number(coherence)
      - gamma * Number(risk)
      - delta * Number(computeCost)
    ).toFixed(6));
  }

  assess(organism = {}, { novelty = 0, risk = 0, policy = {} } = {}) {
    const field = organism?.intention_field || {};
    const uncertainty = this.normalizedEntropy(field?.potentials || {});
    const clarity = Number(organism?.clarte ?? 0.7);
    const stability = Number(organism?.stabilite ?? 0.7);
    const safeNovelty = clamp(novelty);
    const safeRisk = clamp(risk);
    // AURA entretient volontairement plusieurs intentions concurrentes :
    // leur entropie brute est donc élevée même au repos. Nouveauté et risque
    // doivent être les principaux déclencheurs du calcul profond.
    const weights = {
      uncertainty: clamp(policy.uncertainty_weight ?? 0.18, 0.08, 0.35),
      clarity: clamp(policy.clarity_weight ?? 0.18, 0.08, 0.35),
      stability: clamp(policy.stability_weight ?? 0.12, 0.06, 0.30),
      novelty: clamp(policy.novelty_weight ?? 0.30, 0.15, 0.45),
      risk: clamp(policy.risk_weight ?? 0.22, 0.15, 0.55),
    };
    const deepThreshold = clamp(policy.deep_threshold ?? 0.45, 0.30, 0.62);
    const verifiedThreshold = clamp(policy.verified_threshold ?? 0.72, 0.58, 0.86);
    const difficulty = (
      uncertainty * weights.uncertainty
      + (1 - clarity) * weights.clarity
      + (1 - stability) * weights.stability
      + safeNovelty * weights.novelty
      + safeRisk * weights.risk
    );

    let computeTier = 'native';
    let modelRole = 'fast';
    let tokenBudget = 0;
    if (difficulty >= verifiedThreshold) {
      computeTier = 'verified';
      modelRole = 'critic';
      tokenBudget = 1000;
    } else if (difficulty >= deepThreshold) {
      computeTier = 'deep';
      modelRole = 'reasoning';
      tokenBudget = 700;
    } else if (difficulty >= 0.16) {
      computeTier = 'fast';
      modelRole = 'conversation';
      tokenBudget = 180;
    }

    return {
      version: ActiveInferenceEngine.VERSION,
      uncertainty: Number(uncertainty.toFixed(4)),
      belief_clarity: Number((1 - uncertainty).toFixed(4)),
      difficulty: Number(difficulty.toFixed(4)),
      novelty: Number(safeNovelty.toFixed(4)),
      risk: Number(safeRisk.toFixed(4)),
      compute_tier: computeTier,
      model_role: modelRole,
      token_budget: tokenBudget,
      learned_policy: {
        weights,
        deep_threshold: Number(deepThreshold.toFixed(4)),
        verified_threshold: Number(verifiedThreshold.toFixed(4)),
      },
    };
  }
}
