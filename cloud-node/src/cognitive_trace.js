import { randomUUID } from 'node:crypto';

// Bounded, per-session observability. Deliberately excludes prompts, answers,
// private reasoning, retrieved documents and infrastructure error messages.
const STAGES = new Set([
  'request', 'input', 'homeostasis', 'stimulus', 'context', 'decision',
  'research', 'semantic', 'expression', 'homeostasis_post', 'persistence',
  'cycle', 'regulation', 'context_auto', 'reflection_auto', 'execution_auto', 'commit_auto',
]);
const STATES = new Set(['running', 'done', 'skipped', 'error']);
const ALLOWED_DETAILS = new Set([
  'messages', 'intentions', 'lessons', 'reflections', 'work_items',
  'memory_items', 'research_evidence', 'answer_chars', 'token_budget',
  'semantic_requested', 'semantic_available', 'external_required',
  'confidence', 'delta_stability', 'delta_curiosity', 'delta_frustration',
  'decision_act', 'language_mode', 'stimuli_count', 'lessons_count',
  'cycle_reflected', 'execution_confirmed', 'operation_kind', 'trigger_kind',
  'state_stability', 'state_clarity', 'state_curiosity', 'state_confidence',
  'state_frustration', 'state_engagement', 'state_mood',
]);
const LIMIT = 120;
const TTL_MS = 20 * 60_000;
const cleanDetails = (details = {}) => {
  const result = {};
  for (const [key, value] of Object.entries(details || {})) {
    if (!ALLOWED_DETAILS.has(key)) continue;
    if (typeof value === 'boolean') result[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) {
      const bounded = key.startsWith('state_') ? Math.max(0, Math.min(1, value))
        : Math.max(-100000, Math.min(100000, value));
      result[key] = Math.round(bounded * 1000) / 1000;
    } else if (key === 'state_mood' && typeof value === 'string') {
      const allowed = ['calme','fragile','frustrée','préoccupée','satisfaite','déterminée','intriguée','curieuse','lumineuse','claire','engagée'];
      result[key] = allowed.includes(value) ? value : 'inconnu';
    } else if (key === 'trigger_kind' && typeof value === 'string') {
      result[key] = ['ambient', 'manual', 'continuity', 'scheduled', 'event', 'other'].includes(value) ? value : 'other';
    } else if (key === 'operation_kind' && typeof value === 'string') {
      result[key] = ['agent', 'swarm', 'operator', 'outcome'].includes(value) ? value : 'other';
    } else if (key === 'language_mode' && typeof value === 'string') {
      const modes = ['french-language-faculty', 'natural-language-unavailable', 'deterministic-emergency-fallback'];
      result[key] = modes.includes(value) ? value : 'unknown';
    } else if (key === 'decision_act' && typeof value === 'string') {
      result[key] = /^[a-zA-Z_-]{1,48}$/.test(value) ? value : 'other';
    }
  }
  return result;
};

export class CognitiveTraceLedger {
  constructor({ clock = () => Date.now() } = {}) {
    this.clock = clock;
    this.runs = new Map();
  }

  prune() {
    const stamp = this.clock();
    for (const [id, run] of this.runs) {
      if (stamp - run.started_ms > TTL_MS) this.runs.delete(id);
    }
    while (this.runs.size > LIMIT) this.runs.delete(this.runs.keys().next().value);
  }

  start(sessionId, kind = 'conversation') {
    this.prune();
    const id = randomUUID();
    const started = this.clock();
    const run = {
      id, session_id: String(sessionId || ''), kind: kind === 'autonomy' ? 'autonomy' : 'conversation', started_ms: started,
      started_at: new Date(started).toISOString(), state: 'running', events: [],
    };
    this.runs.set(id, run);
    this.mark(id, run.kind === 'autonomy' ? 'cycle' : 'request', 'running');
    this.prune();
    return id;
  }

  startAutonomy(trigger = 'ambient') {
    const id = this.start('__internal_autonomy__', 'autonomy');
    const bucket = /^continuity:/.test(String(trigger)) ? 'continuity'
      : ['ambient', 'manual', 'scheduled', 'event'].includes(String(trigger)) ? String(trigger) : 'other';
    const run = this.runs.get(id);
    if (run?.events?.[0]) run.events[0].details = cleanDetails({ trigger_kind: bucket });
    return id;
  }

  snapshotAutonomy(requestedId = '') {
    return this.snapshot('__internal_autonomy__', requestedId);
  }

  recordOperation(kind, executed = false, outcome = '') {
    if (!['agent', 'swarm', 'operator'].includes(kind)) return '';
    const id = this.startAutonomy('event');
    this.mark(id, 'regulation', 'skipped');
    this.mark(id, 'context_auto', 'skipped');
    if (kind === 'agent' || kind === 'swarm') {
      // Agent output is a generated artifact, not proof of an external action.
      const resultState = kind === 'swarm' ? 'done'
        : outcome === 'completed' ? 'done'
        : outcome === 'failed' ? 'error' : 'skipped';
      this.mark(id, 'reflection_auto', resultState, { operation_kind: kind });
      this.mark(id, 'execution_auto', 'skipped', { execution_confirmed: false });
    } else {
      this.mark(id, 'reflection_auto', 'skipped');
      this.mark(id, 'execution_auto', executed ? 'done' : 'skipped', {
        operation_kind: kind, execution_confirmed: executed === true,
      });
    }
    this.mark(id, 'commit_auto', 'done');
    this.finish(id, kind === 'agent' && outcome === 'failed' ? 'error' : 'done');
    return id;
  }

  mark(id, stage, status = 'done', details = {}) {
    const run = this.runs.get(id);
    if (!run || run.state !== 'running' || !STAGES.has(stage) || !STATES.has(status)) return false;
    const stamp = this.clock();
    const previous = status !== 'running'
      ? [...run.events].reverse().find((event) => event.stage === stage && event.status === 'running')
      : null;
    const durationMs = previous ? Math.max(0, stamp - new Date(previous.at).getTime()) : null;
    run.events.push({
      stage, status, at: new Date(stamp).toISOString(),
      elapsed_ms: Math.max(0, stamp - run.started_ms),
      duration_ms: durationMs,
      details: cleanDetails(details),
    });
    if (run.events.length > 32) run.events.shift();
    return true;
  }

  finish(id, state = 'done') {
    const run = this.runs.get(id);
    if (!run || run.state !== 'running') return false;
    run.state = state === 'done' ? 'done' : 'error';
    const stamp = this.clock();
    run.finished_at = new Date(stamp).toISOString();
    run.duration_ms = Math.max(0, stamp - run.started_ms);
    run.events.push({
      stage: run.kind === 'autonomy' ? 'cycle' : 'request', status: run.state, at: run.finished_at,
      elapsed_ms: run.duration_ms, duration_ms: run.duration_ms, details: {},
    });
    return true;
  }

  snapshot(sessionId, requestedId = '') {
    this.prune();
    const session = String(sessionId || '');
    const runs = [...this.runs.values()].filter((run) => run.session_id === session);
    const run = requestedId
      ? runs.find((entry) => entry.id === requestedId)
      : runs.at(-1);
    if (!run) return { available: false, state: 'idle', events: [], source: 'server-events' };
    return {
      available: true,
      id: run.id,
      kind: run.kind,
      state: run.state,
      started_at: run.started_at,
      finished_at: run.finished_at || null,
      duration_ms: run.duration_ms ?? null,
      events: run.events.map((entry) => ({ ...entry, details: { ...entry.details } })),
      source: 'server-events',
      warning: 'Traces des étapes instrumentées seulement, pas des activations neuronales internes.',
    };
  }
}
