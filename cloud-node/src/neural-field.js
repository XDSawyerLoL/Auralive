const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function lower(value) {
  return String(value || '').toLowerCase();
}

export function normalizeAuraSelfReference(value) {
  return String(value || '')
    .replace(/Je viens de recevoir un signal direct\s*:/gi, 'J’ai intégré un nouveau contexte interne :')
    .replace(/Je le rattache à mon état et à mes intentions avant de répondre\.?/gi, 'Je l’évalue avant de décider s’il devient une intention.')
    .replace(/ce qu’AURA peut/gi, 'ce que je peux')
    .replace(/ce que AURA peut/gi, 'ce que je peux')
    .replace(/AURA doit/gi, 'je dois')
    .replace(/AURA peut/gi, 'je peux')
    .replace(/AURA veut/gi, 'je veux')
    .replace(/AURA est/gi, 'je suis')
    .replace(/pour AURA/gi, 'pour moi')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(text, terms) {
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

function serviceAttention(state) {
  const value = lower(state);
  if (['error','offline','unhealthy','degraded'].includes(value)) return 0.34;
  if (['standby','waiting'].includes(value)) return 0.20;
  if (['online','healthy','ready'].includes(value)) return 0.10;
  return 0.08;
}

export function buildNeuralFieldModel(input = {}) {
  const {
    soul = {},
    organism = {},
    intentions = [],
    traces = [],
    lessons = [],
    counts = {},
    services = [],
    fabricCaps = [],
    bridgeStatus = {},
    webEnabled = false,
    horizonEnabled = false,
    unifiedState = {},
    previous = {},
  } = input;

  const corpus = [
    normalizeAuraSelfReference(unifiedState?.primary_goal?.statement),
    normalizeAuraSelfReference(unifiedState?.dominant_thought),
    ...(Array.isArray(unifiedState?.secondary_goals) ? unifiedState.secondary_goals : [])
      .map((row) => normalizeAuraSelfReference(row?.statement)),
    ...(Array.isArray(unifiedState?.interests) ? unifiedState.interests : [])
      .map((row) => normalizeAuraSelfReference(row?.question)),
    ...(Array.isArray(unifiedState?.open_loops) ? unifiedState.open_loops : [])
      .map((row) => normalizeAuraSelfReference(`${row?.title || ''} ${row?.detail || ''}`)),
    normalizeAuraSelfReference(soul.current_intention),
    normalizeAuraSelfReference(soul.dominant_thought),
    ...intentions.map((row) => normalizeAuraSelfReference(row?.statement)),
    ...traces.map((row) => normalizeAuraSelfReference(`${row?.title || ''} ${row?.content || ''}`)),
    ...lessons.map((row) => normalizeAuraSelfReference(row?.content)),
  ].filter(Boolean).join(' ').toLowerCase();

  const boost = (terms, each = 0.07) => Math.min(0.42, includesAny(corpus, terms) * each);
  const unifiedAttention = unifiedState?.attention && typeof unifiedState.attention === 'object'
    ? unifiedState.attention
    : {};
  const nodes = [];

  const add = ({
    id,
    label,
    cluster,
    role = 'capability',
    score = 0.1,
    activity = null,
    centrality = 0.5,
    status = 'active',
    metadata = {},
  }) => {
    const boundedScore = clamp01(score);
    const boundedActivity = clamp01(activity == null ? boundedScore : activity);
    const boundedCentrality = clamp01(centrality);
    const previousScore = Number(previous?.[id] ?? boundedScore);
    const delta = Number((boundedScore - previousScore).toFixed(4));
    nodes.push({
      id,
      label,
      cluster,
      role,
      score: Number(boundedScore.toFixed(4)),
      activity: Number(boundedActivity.toFixed(4)),
      centrality: Number(boundedCentrality.toFixed(4)),
      pulse: Number(clamp01(boundedActivity * 0.72 + boundedCentrality * 0.28).toFixed(4)),
      status,
      trend: delta > 0.025 ? 'rising' : delta < -0.025 ? 'falling' : 'stable',
      delta,
      metadata,
    });
  };

  add({
    id: 'aura',
    label: 'AURA',
    cluster: 'core',
    role: 'core',
    score: 1,
    activity: Math.max(0.62, clamp01(1 - Number(soul.pressure || 0) * 0.15)),
    centrality: 1,
    status: 'online',
  });

  add({
    id: 'stability',
    label: 'Stabilité',
    cluster: 'regulation',
    score: 0.16
      + Number(soul.pressure || 0) * 0.42
      + (1 - Number(organism.stabilite ?? 1)) * 0.26
      + boost(['stabil','erreur','incident','fiabil','risque']),
    centrality: 0.62,
  });

  add({
    id: 'clarity',
    label: 'Clarté',
    cluster: 'regulation',
    score: 0.14
      + Number(soul.introspection || 0) * 0.22
      + (1 - Number(organism.clarte ?? 1)) * 0.25
      + boost(['clarif','contradic','cohér','comprendre']),
    centrality: 0.66,
  });

  add({
    id: 'curiosity',
    label: 'Curiosité',
    cluster: 'perception',
    score: 0.13
      + Number(soul.curiosity || organism.curiosite || 0) * 0.38
      + Number(unifiedAttention.curiosity || 0) * 0.16
      + boost(['nouveau','github','explor','découvr','veille','crow']),
    centrality: 0.68,
  });

  add({
    id: 'web',
    label: 'Web',
    cluster: 'perception',
    score: 0.10 + (webEnabled ? 0.20 : 0.03) + boost(['web','internet','source','github','recherche']),
    centrality: 0.60,
    status: webEnabled ? 'ready' : 'standby',
  });

  add({
    id: 'evidence',
    label: 'Evidence',
    cluster: 'perception',
    score: 0.12 + (webEnabled ? 0.13 : 0.02) + boost(['preuve','source','vérif','evidence','contradic']),
    centrality: 0.72,
  });

  add({
    id: 'memory',
    label: 'Mémoire',
    cluster: 'memory',
    score: 0.14
      + Number(soul.continuity || 0) * 0.24
      + Math.min(Number(counts.lessons || 0) / 28, 0.18)
      + Math.min(Number(unifiedAttention.unresolved || 0) * 0.18, 0.18)
      + boost(['mémoire','leçon','souvenir','consolid']),
    centrality: 0.84,
  });

  add({
    id: 'learning',
    label: 'Apprentissage',
    cluster: 'memory',
    score: 0.14
      + Number(soul.curiosity || 0) * 0.26
      + Math.min(Number(counts.outcomes || 0) / 30, 0.19)
      + boost(['appren','adapter','amélior','deuxième essai']),
    centrality: 0.79,
  });

  add({
    id: 'reasoning',
    label: 'Raisonnement',
    cluster: 'cognition',
    score: 0.18
      + Number(organism.clarte || 0) * 0.19
      + Math.min(Number(counts.reflections || 0) / 18, 0.15)
      + Number(unifiedAttention.goal || 0) * 0.12
      + boost(['raison','analyse','diagnostic','hypoth']),
    centrality: 0.94,
  });

  add({
    id: 'planning',
    label: 'Planification',
    cluster: 'cognition',
    score: 0.13
      + Math.min(Number(counts.initiatives || 0) / 12, 0.18)
      + Number(unifiedAttention.workload || 0) * 0.16
      + Number(unifiedAttention.goal || 0) * 0.10
      + boost(['plan','dag','mission','objectif','étape']),
    centrality: 0.88,
  });

  add({
    id: 'horizon',
    label: 'HORIZON',
    cluster: 'perception',
    score: 0.08 + (horizonEnabled ? 0.22 : 0.04) + boost(['horizon','prévision','prediction','signal']),
    centrality: 0.55,
    status: horizonEnabled ? 'ready' : 'standby',
  });

  add({
    id: 'automation',
    label: 'Automatisation',
    cluster: 'agency',
    score: 0.13
      + Math.min(Number(counts.routines || 0) / 12, 0.20)
      + Math.min(Number(counts.outcomes || 0) / 24, 0.10)
      + Number(unifiedAttention.workload || 0) * 0.14
      + Number(unifiedAttention.unresolved || 0) * 0.12
      + boost(['automat','routine','command-center','action']),
    centrality: 0.80,
  });

  add({
    id: 'evolution',
    label: 'Évolution',
    cluster: 'agency',
    score: 0.12
      + Math.min(Number(counts.improvements || 0) / 10, 0.24)
      + boost(['évolution','corriger','sandbox','version']),
    centrality: 0.72,
  });

  add({
    id: 'fabric',
    label: 'Capability Fabric',
    cluster: 'infrastructure',
    score: 0.11 + Math.min(fabricCaps.length / 30, 0.24) + boost(['fabric','outil','capability','route']),
    centrality: 0.78,
  });

  add({
    id: 'mesh',
    label: 'Mesh',
    cluster: 'infrastructure',
    score: 0.09
      + Math.min(
        fabricCaps.filter((row) => /peer|mesh|worker/i.test(`${row?.transport || ''} ${row?.provider || ''}`)).length / 10,
        0.24,
      )
      + boost(['mesh','peer','essaim','worker']),
    centrality: 0.61,
  });

  add({
    id: 'worker',
    label: 'Worker local',
    cluster: 'infrastructure',
    score: (bridgeStatus.worker_online ? 0.15 : 0.34) + boost(['worker','studio','local','bloqué','reprendre']),
    centrality: 0.58,
    status: bridgeStatus.worker_online ? 'online' : 'offline',
  });

  for (const service of services) {
    const serviceId = String(service?.id || '').trim();
    if (!serviceId || ['aura','horizon'].includes(serviceId)) continue;
    add({
      id: `product:${serviceId.slice(0, 70)}`,
      label: String(service?.name || serviceId).slice(0, 30),
      cluster: 'ecosystem',
      role: 'product',
      score: 0.08
        + Number(service?.criticality || 0.5) * 0.20
        + serviceAttention(service?.state)
        + boost([lower(serviceId), lower(service?.name)], 0.055),
      activity: 0.08 + serviceAttention(service?.state) + boost([lower(serviceId), lower(service?.name)], 0.06),
      centrality: Math.min(0.66, 0.30 + Number(service?.criticality || 0.5) * 0.30),
      status: lower(service?.state || 'unknown'),
      metadata: {
        kind: String(service?.kind || ''),
        detail: String(service?.state_detail || service?.objective || '').slice(0, 180),
      },
    });
  }

  for (const [index, cap] of fabricCaps.slice(0, 8).entries()) {
    const capId = String(cap?.id || cap?.name || index).slice(0, 80);
    const reliability = clamp01(cap?.observed_reliability ?? cap?.trust ?? 0.45);
    add({
      id: `cap:${capId}`,
      label: String(cap?.name || cap?.id || 'Capacité').slice(0, 30),
      cluster: 'fabric',
      role: 'fabric-capability',
      score: 0.07 + reliability * 0.22,
      activity: 0.08 + reliability * 0.16,
      centrality: 0.34 + reliability * 0.22,
      status: 'available',
      metadata: {
        provider: String(cap?.provider || cap?.transport || '').slice(0, 60),
      },
    });
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const links = [];
  const link = (source, target, weight, kind = 'functional') => {
    if (!nodeMap.has(source) || !nodeMap.has(target)) return;
    const a = nodeMap.get(source);
    const b = nodeMap.get(target);
    const activity = clamp01(
      Math.min(a.activity, b.activity) * 0.68
      + Math.max(a.activity, b.activity) * 0.18
      + Number(weight || 0) * 0.14,
    );
    links.push({
      source,
      target,
      weight: Number(clamp01(weight).toFixed(4)),
      activity: Number(activity.toFixed(4)),
      kind,
    });
  };

  [
    ['aura','stability',.72,'regulation'],
    ['aura','clarity',.76,'regulation'],
    ['aura','reasoning',.94,'cognition'],
    ['aura','memory',.90,'memory'],
    ['aura','curiosity',.78,'perception'],
    ['aura','planning',.88,'cognition'],
    ['aura','automation',.80,'agency'],
    ['aura','fabric',.74,'infrastructure'],
    ['stability','clarity',.78,'regulation'],
    ['clarity','reasoning',.84,'cognition'],
    ['reasoning','planning',.92,'cognition'],
    ['planning','automation',.84,'action'],
    ['automation','evolution',.74,'learning-loop'],
    ['evolution','learning',.76,'learning-loop'],
    ['learning','memory',.94,'memory-loop'],
    ['memory','reasoning',.76,'recall'],
    ['curiosity','web',.92,'exploration'],
    ['web','evidence',.92,'verification'],
    ['evidence','reasoning',.88,'verification'],
    ['horizon','evidence',.62,'forecast-check'],
    ['fabric','mesh',.78,'infrastructure'],
    ['fabric','automation',.80,'execution'],
    ['mesh','worker',.66,'execution'],
    ['worker','automation',.74,'execution'],
  ].forEach((row) => link(...row));

  for (const node of nodes.filter((item) => item.role === 'product')) {
    if (/studio/i.test(node.id)) link(node.id, 'worker', .80, 'product');
    else if (/glide|browser/i.test(node.id)) link(node.id, 'web', .78, 'product');
    else if (/news/i.test(node.id)) link(node.id, 'evidence', .68, 'product');
    else if (/mail/i.test(node.id)) link(node.id, 'memory', .56, 'product');
    else if (/zoon|pulse/i.test(node.id)) link(node.id, 'curiosity', .58, 'product');
    else if (/providence/i.test(node.id)) link(node.id, 'memory', .74, 'product');
    else if (/os/i.test(node.id)) link(node.id, 'fabric', .72, 'product');
    else link(node.id, 'fabric', .50, 'product');
  }

  for (const node of nodes.filter((item) => item.role === 'fabric-capability')) {
    link(node.id, 'fabric', .62, 'capability');
  }

  const ranked = nodes
    .filter((node) => node.id !== 'aura')
    .sort((a, b) => b.activity - a.activity || b.score - a.score);

  for (const node of nodes) {
    node.dominant = node.id === ranked[0]?.id;
    node.secondary = node.id === ranked[1]?.id;
  }

  return {
    version: 'aura-cognitive-field-v9.0',
    dominant: ranked[0]?.id || '',
    secondary: ranked[1]?.id || '',
    nodes,
    links,
    stats: {
      nodes: nodes.length,
      synapses: links.length,
      clusters: [...new Set(nodes.map((node) => node.cluster))].length,
      active: nodes.filter((node) => node.activity >= 0.48).length,
    },
  };
}
