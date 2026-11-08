// AURA v10: grounded process signals + bounded stochasticity + contextual feedback.
// These are functional software-state regulators, never biological measurements.
import { randomBytes } from 'node:crypto';

const clamp = (n, min = 0, max = 1) =>
  Math.min(max, Math.max(min, Number.isFinite(Number(n)) ? Number(n) : min));
const round = (n) => Number(n.toFixed(4));

export const SOMATIC_SETPOINTS = Object.freeze({
  stabilite: 0.75,
  clarte: 0.74,
  confiance: 0.64,
  satisfaction: 0.54,
  frustration: 0.13,
  engagement: 0.68,
  agency: 0.66,
  besoin_de_silence: 0.20,
});

export function newSomaticSeed() {
  return randomBytes(4).readUInt32BE(0) || 0x6d2b79f5;
}

function nextRandom(seed) {
  let value = (Number(seed) >>> 0) || 0x6d2b79f5;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) || 0x6d2b79f5;
}

export class ProcessSomaticSensor {
  constructor({ memory = () => process.memoryUsage(), cpu = () => process.cpuUsage(), clock = () => process.hrtime.bigint(), date = () => Date.now() } = {}) {
    this.memory = memory;
    this.cpu = cpu;
    this.clock = clock;
    this.date = date;
    this.previous = null;
  }

  sample() {
    const m = this.memory();
    const cpu = this.cpu();
    const clock = this.clock();
    const heapUtilization = clamp(Number(m.heapUsed || 0) / Math.max(1, Number(m.heapTotal || 1)));
    let cpuUtilization = null;
    if (this.previous && clock > this.previous.clock) {
      const elapsedMicros = Number(clock - this.previous.clock) / 1000;
      const usedMicros = Math.max(0, cpu.user - this.previous.cpu.user)
        + Math.max(0, cpu.system - this.previous.cpu.system);
      if (elapsedMicros >= 1000) cpuUtilization = clamp(usedMicros / elapsedMicros);
    }
    this.previous = { cpu, clock };
    // Below 70% heap utilization / 80% CPU utilization: no artificial stress.
    // We cannot infer machine-wide CPU, cgroup memory quota or body temperature.
    const heapStress = clamp((heapUtilization - 0.70) / 0.30);
    const cpuStress = cpuUtilization === null ? 0 : clamp((cpuUtilization - 0.80) / 0.20);
    return {
      source: 'node-process',
      sampled_at: new Date(this.date()).toISOString(),
      heap_used_bytes: Math.max(0, Math.round(Number(m.heapUsed) || 0)),
      rss_bytes: Math.max(0, Math.round(Number(m.rss) || 0)),
      heap_utilization: round(heapUtilization),
      cpu_utilization: cpuUtilization === null ? null : round(cpuUtilization),
      compute_pressure: round(clamp(Math.max(heapStress, cpuStress))),
      coverage: 'current-process-only',
    };
  }
}

export function evolveHomeostasis(input, {
  signal = 'ambient',
  seconds = 30,
  sensor = null,
  nowMs = Date.now(),
} = {}) {
  const state = structuredClone(input);
  const previous = state.homeostasis && typeof state.homeostasis === 'object'
    ? state.homeostasis : {};
  let seed = (Number(previous.seed) >>> 0) || 0x6d2b79f5;
  const elapsed = Math.max(0, Math.min(21600, Number(seconds) || 0));
  const decay = Math.exp(-elapsed / 3600);
  let success = clamp(previous.success_ema ?? 0.15) * decay;
  let failure = clamp(previous.failure_ema ?? 0.05) * decay;

  if (signal === 'action_success') {
    success = clamp(success * 0.75 + 0.25);
    failure *= 0.72;
  } else if (signal === 'action_failure') {
    failure = clamp(failure * 0.72 + 0.28);
    success *= 0.80;
  } else if (signal === 'reply_failure') {
    failure = clamp(failure * 0.86 + 0.14);
  } else if (signal === 'reply_success') {
    // Producing a sentence does not prove a task was accomplished.
    failure *= 0.99;
  }

  const reading = sensor && sensor.source === 'node-process' ? sensor : previous.sensor || null;
  const resourcePressure = clamp(reading?.compute_pressure ?? 0);
  const target = {
    stabilite: 0.75 - 0.29 * failure - 0.18 * resourcePressure + 0.04 * success,
    clarte: 0.74 - 0.24 * failure - 0.16 * resourcePressure + 0.03 * success,
    confiance: 0.63 - 0.27 * failure + 0.19 * success,
    satisfaction: 0.52 - 0.30 * failure + 0.19 * success,
    frustration: 0.13 + 0.49 * failure + 0.20 * resourcePressure - 0.07 * success,
    engagement: 0.67 - 0.15 * resourcePressure - 0.09 * failure + 0.05 * success,
    agency: 0.66 - 0.18 * resourcePressure - 0.12 * failure + 0.05 * success,
    besoin_de_silence: 0.20 + 0.23 * resourcePressure + 0.16 * failure,
  };

  // Homeostasis is continuous (elapsed time) and also responds to situations.
  // A 60-second equivalent is used for discrete events, never on mere reads.
  const event = signal !== 'ambient';
  const integrationSeconds = event ? Math.max(elapsed, 60) : elapsed;
  const gain = clamp(1 - Math.exp(-integrationSeconds / 520), 0, 0.36);
  const deltas = {};
  for (const [key, proposed] of Object.entries(target)) {
    seed = nextRandom(seed);
    const boundedJitter = event ? (((seed / 0xffffffff) * 2 - 1) * 0.004) : 0;
    const old = clamp(state[key] ?? SOMATIC_SETPOINTS[key], 0.03, 0.97);
    const next = clamp(old + (clamp(proposed, 0.04, 0.94) - old) * gain + boundedJitter, 0.03, 0.97);
    state[key] = round(next);
    deltas[key] = round(next - old);
  }

  state.homeostasis = {
    revision: 1,
    seed,
    steps: Math.max(0, Math.round(Number(previous.steps) || 0)) + 1,
    last_at: new Date(nowMs).toISOString(),
    last_signal: String(signal).slice(0, 40),
    success_ema: round(success),
    failure_ema: round(failure),
    resource_pressure: round(resourcePressure),
    regulation_gain: round(gain),
    last_delta: deltas,
    sensor: reading,
    randomness: 'seeded-bounded-jitter-low-stakes',
  };
  return state;
}

export function publicSomaticState(homeostasis = {}) {
  const sensor = homeostasis.sensor || null;
  return {
    revision: Number(homeostasis.revision || 0),
    last_at: String(homeostasis.last_at || ''),
    last_signal: String(homeostasis.last_signal || ''),
    steps: Number(homeostasis.steps || 0),
    success_ema: clamp(homeostasis.success_ema ?? 0),
    failure_ema: clamp(homeostasis.failure_ema ?? 0),
    resource_pressure: clamp(homeostasis.resource_pressure ?? 0),
    last_delta: homeostasis.last_delta || {},
    sensor: sensor ? {
      source: sensor.source,
      sampled_at: sensor.sampled_at,
      heap_used_bytes: sensor.heap_used_bytes,
      rss_bytes: sensor.rss_bytes,
      heap_utilization: sensor.heap_utilization,
      cpu_utilization: sensor.cpu_utilization,
      compute_pressure: sensor.compute_pressure,
      coverage: sensor.coverage,
    } : null,
    randomness: 'bounded pseudo-random variability; not evidence of subjective emotion',
    evidence: 'Measured: process heap / CPU when available. Inferred: functional state and mood.',
  };
}
