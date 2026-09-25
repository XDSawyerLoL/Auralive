const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value)));

const DEFAULT_PARAMS = Object.freeze({
  uncertainty_weight: 0.18,
  clarity_weight: 0.18,
  stability_weight: 0.12,
  novelty_weight: 0.30,
  risk_weight: 0.22,
  deep_threshold: 0.45,
  verified_threshold: 0.72,
  confidence_bias: 0,
});

export class NativePolicyLearner {
  static VERSION = 'aura-native-policy-learning-v1';

  defaultState() {
    return {
      version: NativePolicyLearner.VERSION,
      observations: 0,
      successes: 0,
      failures: 0,
      success_rate: 0.5,
      params: { ...DEFAULT_PARAMS },
      last_update_at: '',
      last_signal: 'initial',
    };
  }

  migrate(candidate = {}) {
    const state = candidate && typeof candidate === 'object'
      ? structuredClone(candidate)
      : this.defaultState();
    const defaults = this.defaultState();
    state.version = NativePolicyLearner.VERSION;
    state.observations = Math.max(0, Number(state.observations || 0));
    state.successes = Math.max(0, Number(state.successes || 0));
    state.failures = Math.max(0, Number(state.failures || 0));
    state.params = { ...DEFAULT_PARAMS, ...(state.params || {}) };

    const p = state.params;
    p.uncertainty_weight = clamp(p.uncertainty_weight, 0.08, 0.35);
    p.clarity_weight = clamp(p.clarity_weight, 0.08, 0.35);
    p.stability_weight = clamp(p.stability_weight, 0.06, 0.30);
    p.novelty_weight = clamp(p.novelty_weight, 0.15, 0.45);
    p.risk_weight = clamp(p.risk_weight, 0.15, 0.55);
    p.deep_threshold = clamp(p.deep_threshold, 0.30, 0.62);
    p.verified_threshold = clamp(p.verified_threshold, 0.58, 0.86);
    p.confidence_bias = clamp(p.confidence_bias, -0.12, 0.08);

    const total = state.successes + state.failures;
    state.success_rate = total > 0
      ? Number((state.successes / total).toFixed(4))
      : 0.5;
    state.last_update_at = String(state.last_update_at || '');
    state.last_signal = String(state.last_signal || defaults.last_signal);
    return state;
  }

  update(candidate, { ok, surprise = 0, risk = 0 } = {}) {
    const state = this.migrate(candidate);
    const p = state.params;
    const safeSurprise = clamp(surprise, 0, 1);
    const safeRisk = clamp(risk, 0, 1);
    const learningRate = 0.012 + safeSurprise * 0.018;

    state.observations += 1;
    if (ok) state.successes += 1;
    else state.failures += 1;

    if (ok) {
      // Les succès répétés permettent une légère économie de calcul, sans
      // réduire fortement la prudence apprise.
      p.risk_weight -= learningRate * 0.15 * (1 - safeRisk);
      p.deep_threshold += learningRate * 0.10;
      p.verified_threshold += learningRate * 0.06;
      p.confidence_bias += learningRate * 0.08;
      state.last_signal = 'successful-outcome';
    } else {
      // Un échec augmente durablement la sensibilité au risque et déclenche
      // plus tôt le calcul profond/vérifié.
      p.risk_weight += learningRate * (0.55 + safeRisk * 0.35);
      p.uncertainty_weight += learningRate * 0.20;
      p.deep_threshold -= learningRate * 0.35;
      p.verified_threshold -= learningRate * 0.25;
      p.confidence_bias -= learningRate * 0.30;
      state.last_signal = 'failed-outcome';
    }

    if (safeSurprise >= 0.55) {
      p.novelty_weight += learningRate * 0.25;
      p.uncertainty_weight += learningRate * 0.15;
    }

    state.last_update_at = new Date().toISOString();
    return this.migrate(state);
  }

  inferenceParams(candidate) {
    return { ...this.migrate(candidate).params };
  }

  diagnostic(candidate) {
    const state = this.migrate(candidate);
    return {
      version: state.version,
      observations: state.observations,
      successes: state.successes,
      failures: state.failures,
      success_rate: state.success_rate,
      params: { ...state.params },
      last_update_at: state.last_update_at,
      last_signal: state.last_signal,
      learned_from_outcomes: true,
      bounded_parameters: true,
    };
  }
}
