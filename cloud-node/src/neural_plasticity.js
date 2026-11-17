// AURA scientific sandbox: event-based Tsodyks–Markram-inspired STP and
// pair-trace STDP. Parameters are illustrative, NOT fitted to human synapses.
export const PLASTICITY_SCHEMA = 'aura-synapse-stp-stdp-v1';
const bounded = (v, a, b, label) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < a || v > b)
    throw new RangeError('invalid '+label);
  return v;
};
const round = n => Number(n.toFixed(8));
export function initialPlasticSynapse({weight = .5, baseline_utilization = .2,
  tau_facilitation_ms = 200, tau_recovery_ms = 700,
  tau_pre_ms = 20, tau_post_ms = 20, a_plus = .018, a_minus = .021} = {}) {
  bounded(weight, 0, 1, 'weight');
  bounded(baseline_utilization, .01, 1, 'utilization');
  for (const [n, v] of Object.entries({tau_facilitation_ms, tau_recovery_ms,
    tau_pre_ms, tau_post_ms})) bounded(v, 1, 5000, n);
  bounded(a_plus, 0, .2, 'potentiation');
  bounded(a_minus, 0, .2, 'depression');
  return {
    schema: PLASTICITY_SCHEMA, time_ms: 0, weight, resources: 1,
    utilization: baseline_utilization, pre_trace: 0, post_trace: 0,
    spike_count_pre: 0, spike_count_post: 0,
    parameters: {baseline_utilization, tau_facilitation_ms,
      tau_recovery_ms, tau_pre_ms, tau_post_ms, a_plus, a_minus},
  };
}
export function advancePlasticSynapse(state, {
  time_ms, pre_spike = false, post_spike = false, plasticity_enabled = true,
} = {}) {
  if (state?.schema !== PLASTICITY_SCHEMA) throw new TypeError('invalid synapse state');
  bounded(time_ms, state.time_ms, 100000, 'monotone time');
  if (typeof pre_spike !== 'boolean' || typeof post_spike !== 'boolean' ||
    typeof plasticity_enabled !== 'boolean') throw new TypeError('spike flags required');
  const p = state.parameters;
  if (!p || Object.values(p).some(v => typeof v !== 'number' || !Number.isFinite(v)))
    throw new TypeError('invalid plasticity parameters');
  const dt = time_ms - state.time_ms;
  if (dt > 10000) throw new RangeError('time gap exceeds research bound');
  const pre = state.pre_trace * Math.exp(-dt / p.tau_pre_ms);
  const post = state.post_trace * Math.exp(-dt / p.tau_post_ms);
  const available = 1 - (1 - state.resources) * Math.exp(-dt / p.tau_recovery_ms);
  const utilization = p.baseline_utilization +
    (state.utilization - p.baseline_utilization) * Math.exp(-dt / p.tau_facilitation_ms);
  let weight = bounded(state.weight, 0, 1, 'weight');
  let resources = bounded(available, 0, 1, 'resources');
  let nextU = bounded(utilization, 0, 1, 'utilization');
  let released = 0;
  // A pre-before-post pair potentiates; post-before-pre depresses.
  // Simultaneous spikes have zero pairing effect, avoiding undefined order.
  if (plasticity_enabled && pre_spike !== post_spike) {
    if (pre_spike) weight = Math.max(0, weight - p.a_minus * post);
    if (post_spike) weight = Math.min(1, weight + p.a_plus * pre);
  }
  if (pre_spike) {
    released = resources * nextU * weight;
    resources *= (1 - nextU);
    nextU += p.baseline_utilization * (1 - nextU);
  }
  const result = {
    schema: PLASTICITY_SCHEMA, time_ms, weight: round(weight),
    resources: round(resources), utilization: round(nextU),
    pre_trace: round(pre + (pre_spike ? 1 : 0)),
    post_trace: round(post + (post_spike ? 1 : 0)),
    spike_count_pre: state.spike_count_pre + Number(pre_spike),
    spike_count_post: state.spike_count_post + Number(post_spike),
    parameters: {...p},
  };
  return {state: result, released_efficacy: round(released),
    weight_change: round(weight - state.weight),
    mechanisms: ['short-term-release-resource', 'presynaptic-facilitation',
      'timing-dependent-long-term-plasticity'],
    measured_human_parameter_fit: false, production_write_authorized: false};
}
export function compareSpikeOrder({delay_ms = 10, weight = .5} = {}) {
  bounded(delay_ms, 1, 80, 'pairing delay');
  const start = initialPlasticSynapse({weight});
  const pre = advancePlasticSynapse(start, {time_ms: 1, pre_spike: true});
  const plus = advancePlasticSynapse(pre.state, {time_ms: 1 + delay_ms, post_spike: true});
  const post = advancePlasticSynapse(start, {time_ms: 1, post_spike: true});
  const minus = advancePlasticSynapse(post.state, {time_ms: 1 + delay_ms, pre_spike: true});
  return {pre_before_post: plus.state.weight,
    post_before_pre: minus.state.weight, baseline_weight: weight,
    causal_scope: 'synthetic-paired-STDP-rule-not-human-validated',
    human_synaptic_fidelity: false};
}