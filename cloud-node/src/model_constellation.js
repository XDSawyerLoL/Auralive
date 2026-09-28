const PROFILES = Object.freeze([
  Object.freeze({
    id: 'lukey03/Qwen3.5-9B-abliterated',
    aliases: ['qwen3.5-9b-abliterated', 'qwen35-9b-abliterated', 'qwen-abliterated'],
    family: 'qwen3.5',
    kind: 'divergent-specialist',
    license: 'Apache-2.0',
    roles: Object.freeze({
      divergent: 0.99,
      creative: 0.96,
      brainstorming: 0.96,
      redteam: 0.90,
      code: 0.82,
      reasoning: 0.80,
      research: 0.72,
      critic: 0.58,
      security: 0.50,
      general: 0.70,
    }),
    authority: 'proposal-only',
    safety_boundary: 'aura-policy-and-verification',
    deployment: 'local-or-voluntary-mesh',
    notes: 'Refusal-reduced model. Useful for divergent hypotheses; never bypasses AURA action/safety policy.',
  }),
  Object.freeze({
    id: 'moonshotai/Kimi-K3',
    aliases: ['kimi-k3', 'moonshot-k3'],
    family: 'kimi-k3',
    kind: 'frontier-long-context-vision',
    license: 'Kimi-K3-License',
    roles: Object.freeze({
      vision: 0.99,
      long_context: 0.99,
      research: 0.97,
      reasoning: 0.95,
      critic: 0.91,
      code: 0.88,
      evolution: 0.88,
      general: 0.90,
    }),
    authority: 'evidence-or-proposal',
    safety_boundary: 'aura-policy-and-verification',
    deployment: 'verified-free-provider-or-voluntary-mesh',
    notes: 'Very large frontier model; never auto-downloaded by AURA and never routed through a paid fallback.',
  }),
]);

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

export function modelProfiles() {
  return PROFILES.map((profile) => ({
    ...profile,
    aliases: [...profile.aliases],
    roles: { ...profile.roles },
  }));
}

export function matchModelProfile(model) {
  const wanted = norm(model).replace(/:free$/i, '');
  if (!wanted) return null;
  for (const profile of PROFILES) {
    const ids = [profile.id, ...profile.aliases].map(norm);
    if (ids.some((id) => wanted === id || wanted.includes(id))) return profile;
  }
  return null;
}

export function constellationRoleScore(model, role = 'general') {
  const profile = matchModelProfile(model);
  if (!profile) return null;
  const key = norm(role).replace(/-/g, '_') || 'general';
  const score = Number(profile.roles[key] ?? profile.roles.general ?? 0.5);
  return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0.5;
}

export function modelRoutingPolicy(model) {
  const profile = matchModelProfile(model);
  if (!profile) {
    return {
      known: false,
      authority: 'standard',
      safety_boundary: 'aura-policy-and-verification',
    };
  }
  return {
    known: true,
    id: profile.id,
    kind: profile.kind,
    authority: profile.authority,
    safety_boundary: profile.safety_boundary,
    deployment: profile.deployment,
    license: profile.license,
  };
}
