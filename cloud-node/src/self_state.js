const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function text(value, max = 1200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function scoreGoal(goal = {}) {
  const priority = clamp01(goal.priority ?? 0.5);
  const recency = clamp01(goal.recency ?? 0.5);
  const urgency = clamp01(goal.urgency ?? 0);
  const persistence = clamp01(goal.persistence ?? 0.4);
  return Number((priority * 0.46 + urgency * 0.26 + recency * 0.16 + persistence * 0.12).toFixed(4));
}

function uniq(items = [], key = (x) => JSON.stringify(x)) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const id = key(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

function normalizedFailure(row = {}) {
  const automation = text(row.automation_id, 220);
  const signature = text(row.signature, 500);
  return {
    kind: 'failure',
    id: `${automation}:${signature}`,
    title: automation || 'Échec opérationnel',
    detail: signature,
    urgency: 0.90,
    priority: 0.90,
    updated_at: row.created_at || row.updated_at || '',
  };
}

export const UNIFIED_SELF_STATE_VERSION = 'aura-unified-self-state-v1';

export function composeUnifiedSelfState(input = {}) {
  const soul = input.soul || {};
  const organism = input.organism || soul.organism || {};
  const intentions = Array.isArray(input.intentions) ? input.intentions : [];
  const initiatives = Array.isArray(input.initiatives) ? input.initiatives : [];
  const work = Array.isArray(input.work) ? input.work : [];
  const curiosity = Array.isArray(input.curiosity) ? input.curiosity : [];
  const failures = Array.isArray(input.failures) ? input.failures : [];
  const traces = Array.isArray(input.traces) ? input.traces : [];
  const reflections = Array.isArray(input.reflections) ? input.reflections : [];
  const bridge = input.bridge || {};

  const goals = [];

  for (const row of initiatives) {
    const status = text(row.status, 40).toLowerCase();
    if (!['running','queued','waiting'].includes(status)) continue;
    const statement = text(row.objective || row.title, 1400);
    if (!statement) continue;
    goals.push({
      kind: 'initiative',
      id: text(row.id || row.title, 220),
      statement,
      priority: clamp01(row.priority ?? 0.65),
      urgency: status === 'running' ? 0.86 : status === 'waiting' ? 0.68 : 0.72,
      recency: 0.84,
      persistence: 0.78,
      status,
      source: 'command-center',
      blocked: status === 'waiting',
      updated_at: row.updated_at || '',
    });
  }

  for (const row of intentions) {
    const statement = text(row.statement, 1400);
    if (!statement) continue;
    goals.push({
      kind: 'intention',
      id: text(row.id || statement, 220),
      statement,
      priority: clamp01(row.priority ?? 0.5),
      urgency: 0.54,
      recency: 0.78,
      persistence: 0.72,
      status: text(row.status || 'active', 40),
      source: text(row.source || 'intention', 80),
      blocked: false,
      updated_at: row.updated_at || '',
    });
  }

  for (const row of failures.slice(0, 8)) {
    const f = normalizedFailure(row);
    goals.push({
      kind: 'failure',
      id: f.id,
      statement: `Comprendre et résoudre ${f.title}${f.detail ? ` : ${f.detail}` : ''}`,
      priority: f.priority,
      urgency: f.urgency,
      recency: 0.88,
      persistence: 0.86,
      status: 'open',
      source: 'outcome-memory',
      blocked: false,
      updated_at: f.updated_at,
    });
  }

  for (const row of curiosity.slice(0, 8)) {
    const question = text(row.content || row.question || row.title, 1200);
    if (!question) continue;
    goals.push({
      kind: 'interest',
      id: text(row.id || question, 220),
      statement: question,
      priority: clamp01(row.priority ?? row.context?.priority ?? 0.48),
      urgency: 0.28,
      recency: 0.74,
      persistence: 0.42,
      status: 'interesting',
      source: 'curiosity',
      blocked: false,
      updated_at: row.created_at || row.updated_at || '',
    });
  }

  const soulIntention = text(soul.current_intention, 1400);
  const genericObserver = /^(observer|observer, comprendre|maintenir une présence utile|maintenir une veille utile)/i.test(soulIntention);
  if (soulIntention && !genericObserver) {
    goals.push({
      kind: 'soul-intention',
      id: 'soul-current',
      statement: soulIntention,
      priority: 0.60,
      urgency: 0.44,
      recency: 0.76,
      persistence: 0.64,
      status: 'active',
      source: 'soul',
      blocked: false,
      updated_at: soul.last_tick_at || '',
    });
  }

  const ranked = uniq(goals, (g) => `${g.kind}:${g.statement.toLowerCase()}`)
    .map((goal) => ({ ...goal, salience: scoreGoal(goal) }))
    .sort((a, b) => b.salience - a.salience || b.priority - a.priority);

  const primary = ranked[0] || null;
  const secondary = ranked.slice(1, 5);

  const activeWork = uniq([
    ...initiatives
      .filter((row) => ['running','queued','waiting'].includes(text(row.status).toLowerCase()))
      .map((row) => ({
        kind: 'initiative',
        title: text(row.title || row.objective, 700),
        status: text(row.status, 40),
        priority: clamp01(row.priority ?? 0.5),
        blocked: text(row.status).toLowerCase() === 'waiting',
        updated_at: row.updated_at || '',
      })),
    ...work
      .filter((row) => ['initiative','intention','improvement'].includes(text(row.kind || '').toLowerCase()))
      .slice(0, 8)
      .map((row) => ({
        kind: text(row.kind || 'work', 60),
        title: text(row.title, 700),
        status: text(row.status || 'active', 40),
        priority: clamp01(row.priority ?? 0.4),
        blocked: /waiting|blocked/i.test(text(row.status || row.detail)),
        updated_at: row.updated_at || '',
      })),
  ], (row) => `${row.kind}:${row.title.toLowerCase()}`).slice(0, 10);

  const interests = uniq(curiosity.map((row) => ({
    question: text(row.content || row.question || row.title, 1000),
    priority: clamp01(row.priority ?? row.context?.priority ?? 0.45),
    target: text(row.target || row.context?.target || '', 80),
    created_at: row.created_at || '',
  })).filter((row) => row.question), (row) => row.question.toLowerCase()).slice(0, 8);

  const openLoops = uniq([
    ...failures.slice(0, 8).map(normalizedFailure),
    ...activeWork.filter((row) => row.blocked).map((row) => ({
      kind: 'blocked-work',
      id: row.title,
      title: row.title,
      detail: row.status,
      urgency: 0.72,
      priority: row.priority,
      updated_at: row.updated_at,
    })),
  ], (row) => `${row.kind}:${row.id || row.title}`).slice(0, 10);

  const recentActions = traces.slice(0, 10).map((row) => ({
    kind: text(row.kind, 80),
    title: text(row.title || row.content, 500),
    created_at: row.created_at || '',
  })).filter((row) => row.title);

  const nextAction = text(
    reflections?.[0]?.next_action
    || initiatives.find((row) => text(row.status).toLowerCase() === 'running')?.objective
    || primary?.statement
    || '',
    1200,
  );

  const workerOnline = Boolean(bridge.worker_online);
  const blocked = openLoops.length > 0 || activeWork.some((row) => row.blocked);
  const idle = !primary && activeWork.length === 0 && interests.length === 0 && openLoops.length === 0;
  const drive = primary
    ? primary.kind === 'failure' ? 'repair'
      : primary.kind === 'interest' ? 'explore'
        : primary.kind === 'initiative' ? 'execute'
          : 'pursue'
    : Number(organism.curiosite ?? soul.curiosity ?? 0) >= 0.58 ? 'explore' : 'observe';

  const dominantThought = primary
    ? primary.statement
    : text(soul.dominant_thought || 'Observer mon environnement et maintenir ma continuité.', 1200);

  return {
    version: UNIFIED_SELF_STATE_VERSION,
    generated_at: new Date().toISOString(),
    mood: text(organism.mood || soul.mood || 'calme', 80),
    primary_goal: primary,
    secondary_goals: secondary,
    active_work: activeWork,
    interests,
    open_loops: openLoops,
    recent_actions: recentActions,
    next_action: nextAction,
    dominant_thought: dominantThought,
    autonomy: {
      idle,
      blocked,
      drive,
      active: !idle,
      worker_online: workerOnline,
      self_generated_goal: Boolean(primary && ['curiosity','autonomy-v9','outcome-memory'].includes(primary.source)),
      salience: Number(primary?.salience || 0),
    },
    attention: {
      goal: Number(primary?.salience || 0),
      curiosity: clamp01(Number(organism.curiosite ?? soul.curiosity ?? 0)),
      stability_pressure: clamp01(1 - Number(organism.stabilite ?? 1)),
      unresolved: clamp01(openLoops.length / 5),
      workload: clamp01(activeWork.length / 6),
    },
  };
}
