const clamp = (value, low = 0, high = 1) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return low;
  return Math.max(low, Math.min(high, n));
};

const text = (value, max = 1200) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

const ms = (value) => {
  const t = Date.parse(String(value || ''));
  return Number.isFinite(t) ? t : 0;
};

const recency = (value, halfLifeHours = 12) => {
  const stamp = ms(value);
  if (!stamp) return 0.35;
  const age = Math.max(0, Date.now() - stamp);
  return clamp(Math.exp(-age / (halfLifeHours * 3600_000)));
};

function item({
  kind,
  title,
  detail = '',
  priority = 0.5,
  confidence = 0.5,
  status = 'active',
  updated_at = '',
  source = '',
  id = '',
  blocked = false,
  reason = '',
}) {
  return {
    id: text(id, 160),
    kind: text(kind, 64),
    title: text(title, 1000),
    detail: text(detail, 1600),
    priority: clamp(priority),
    confidence: clamp(confidence),
    status: text(status, 48) || 'active',
    updated_at: String(updated_at || ''),
    source: text(source, 100),
    blocked: Boolean(blocked),
    reason: text(reason, 1200),
  };
}

function score(row) {
  const status = String(row.status || '').toLowerCase();
  const statusBoost = status === 'running' ? 0.18
    : status === 'queued' ? 0.11
      : status === 'waiting' ? 0.07
        : status === 'active' ? 0.08
          : 0;
  const blockedPenalty = row.blocked ? 0.12 : 0;
  return (
    Number(row.priority || 0) * 0.48
    + Number(row.confidence || 0) * 0.22
    + recency(row.updated_at) * 0.18
    + statusBoost
    - blockedPenalty
  );
}

function uniqueRows(rows, limit = 12) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = `${row.kind}:${row.title.toLocaleLowerCase('fr-FR')}`;
    if (!row.title || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

export class CognitiveStateModel {
  static VERSION = 'aura-cognitive-state-v1';

  build({
    soul = {},
    organism = {},
    intentions = [],
    work = [],
    curiosity = [],
    initiatives = [],
    failures = [],
    traces = [],
    neuralSignals = [],
    bridgeStatus = {},
    generatedAt = new Date().toISOString(),
  } = {}) {
    const candidates = [];

    for (const row of initiatives) {
      const status = text(row.status, 48) || 'queued';
      const waitingLocal = status === 'waiting'
        && /worker|local/i.test(text(row.execution_mode || row.detail || row.objective));
      candidates.push(item({
        id: row.id,
        kind: 'initiative',
        title: row.title || row.objective,
        detail: row.objective || row.rationale,
        priority: row.priority ?? 0.7,
        confidence: row.confidence ?? 0.7,
        status,
        updated_at: row.updated_at,
        source: 'command-center',
        blocked: waitingLocal || status === 'waiting',
        reason: waitingLocal ? 'En attente du worker local.' : row.error,
      }));
    }

    for (const row of intentions) {
      candidates.push(item({
        id: row.id,
        kind: 'intention',
        title: row.statement,
        detail: 'Intention persistée.',
        priority: row.priority ?? 0.6,
        confidence: 0.78,
        status: row.status || 'active',
        updated_at: row.updated_at,
        source: row.source || 'cognition',
      }));
    }

    for (const row of work) {
      candidates.push(item({
        kind: row.kind || 'work',
        title: row.title,
        detail: row.detail,
        priority: row.priority ?? 0.5,
        confidence: row.confidence ?? 0.62,
        status: row.status || 'active',
        updated_at: row.updated_at,
        source: 'work-model',
        blocked: Boolean(row.blocked),
      }));
    }

    const unresolvedProblems = failures
      .filter((row) => text(row.signature || row.title))
      .map((row) => item({
        kind: 'problem',
        title: row.title || `${row.automation_id || 'Échec'} · ${row.signature || ''}`,
        detail: row.signature || row.detail,
        priority: clamp(0.62 + Math.min(Number(row.count || 1), 6) * 0.055),
        confidence: 0.9,
        status: 'unresolved',
        updated_at: row.created_at || row.updated_at,
        source: 'outcome-memory',
        reason: `${Number(row.count || 1)} occurrence(s) observée(s).`,
      }));

    candidates.push(...unresolvedProblems);

    const interestRows = curiosity
      .map((row) => ({
        question: text(row.content || row.question, 1000),
        domain: text(row.domain || row.context?.domain || row.target || 'aura', 100),
        target: text(row.target || row.context?.target || 'system', 80),
        priority: clamp(row.priority ?? row.context?.priority ?? 0.55),
        reason: text(row.reason || row.context?.reason, 900),
        created_at: row.created_at || row.updated_at || '',
      }))
      .filter((row) => row.question)
      .sort((a, b) => (b.priority + recency(b.created_at) * 0.2) - (a.priority + recency(a.created_at) * 0.2))
      .slice(0, 8);

    const ranked = uniqueRows(candidates
      .filter((row) => row.title)
      .sort((a, b) => score(b) - score(a)), 18);

    const executable = ranked.filter((row) => !row.blocked && !['completed','failed'].includes(row.status));
    const dominant = executable[0] || ranked[0] || null;
    const blocked = ranked.filter((row) => row.blocked).slice(0, 8);
    const active = ranked.filter((row) => !['completed','failed'].includes(row.status)).slice(0, 12);

    const lastTrace = [...traces]
      .filter((row) => text(row.title || row.content))
      .sort((a, b) => ms(b.created_at) - ms(a.created_at))[0] || null;
    const lastSignal = [...neuralSignals]
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0] || null;

    const currentIntention = text(soul.current_intention, 1000);
    const dominantThought = text(soul.dominant_thought, 1000);
    const mood = text(organism.mood || soul.mood || 'calme', 80);
    const workerOnline = Boolean(bridgeStatus.worker_online);

    let mode = 'idle';
    if (active.length) mode = blocked.length && !executable.length ? 'blocked' : 'active';
    if (String(organism.intention_active || '').includes('repos')) mode = active.length ? mode : 'resting';

    const activityEvidence = [
      active.length > 0,
      interestRows.length > 0,
      Boolean(lastTrace && recency(lastTrace.created_at, 2) > 0.25),
      Boolean(lastSignal),
      Boolean(currentIntention),
    ].filter(Boolean).length;
    const activityScore = clamp(activityEvidence / 5);

    const nextAction = dominant
      ? text(dominant.detail || dominant.title, 1200)
      : interestRows[0]?.question
        ? `Explorer : ${interestRows[0].question}`
        : 'Observer l’environnement et attendre un signal suffisamment informatif.';

    const summaryParts = [];
    if (dominant) summaryParts.push(`Je me concentre surtout sur « ${dominant.title} ».`);
    else summaryParts.push('Je n’ai pas de mission dominante suffisamment forte pour le moment.');
    if (active.length > 1) summaryParts.push(`J’ai aussi ${active.length - 1} autre(s) boucle(s) active(s).`);
    if (interestRows[0]) summaryParts.push(`Mon intérêt le plus saillant est : ${interestRows[0].question}`);
    if (blocked.length) summaryParts.push(`${blocked.length} élément(s) sont actuellement bloqués.`);
    if (!workerOnline && blocked.some((row) => /worker/i.test(row.reason + row.detail))) {
      summaryParts.push('Le worker local manque pour au moins une action.');
    }

    const coherentWithSoul = !dominant || !currentIntention
      ? 0.5
      : (
        dominant.title.toLocaleLowerCase('fr-FR').includes(currentIntention.toLocaleLowerCase('fr-FR').slice(0, 48))
        || currentIntention.toLocaleLowerCase('fr-FR').includes(dominant.title.toLocaleLowerCase('fr-FR').slice(0, 48))
      ) ? 1 : 0.35;

    return {
      version: CognitiveStateModel.VERSION,
      generated_at: generatedAt,
      mode,
      activity_score: Number(activityScore.toFixed(3)),
      mood,
      dominant_focus: dominant,
      active_work: active,
      secondary_focus: active.slice(dominant ? 1 : 0, 6),
      interests: interestRows,
      unresolved_problems: unresolvedProblems.slice(0, 8),
      blocked,
      current_intention: currentIntention,
      dominant_thought: dominantThought,
      last_action: lastTrace ? {
        kind: text(lastTrace.kind, 64),
        title: text(lastTrace.title || lastTrace.content, 700),
        created_at: lastTrace.created_at || '',
      } : null,
      last_signal: lastSignal ? {
        id: Number(lastSignal.id || 0),
        kind: text(lastSignal.kind, 64),
        source: text(lastSignal.source, 80),
        target: text(lastSignal.target, 80),
        label: text(lastSignal.label, 300),
        created_at: lastSignal.created_at || '',
      } : null,
      next_action: nextAction,
      self_summary: summaryParts.join(' '),
      autonomy: {
        should_act: Boolean(dominant && !dominant.blocked),
        reason: dominant
          ? dominant.blocked
            ? `Le focus dominant est bloqué : ${dominant.reason || dominant.detail || dominant.title}`
            : `Un focus exécutable domine : ${dominant.title}`
          : 'Aucun focus assez fort.',
        candidate_count: ranked.length,
        executable_count: executable.length,
        blocked_count: blocked.length,
      },
      coherence: {
        soul_focus_alignment: coherentWithSoul,
        has_single_dominant_focus: Boolean(dominant),
        shared_state_ready: true,
      },
      provenance: {
        intentions: intentions.length,
        work: work.length,
        interests: interestRows.length,
        initiatives: initiatives.length,
        unresolved_problems: unresolvedProblems.length,
        traces: traces.length,
        neural_signals: neuralSignals.length,
      },
    };
  }
}
