// AURA Reflex: bounded, typed routing policy. Inspired by System One;
 // no Jev API, hosted model, payment, or calibrated-probability claim.
const TIERS = ['native', 'fast', 'deep', 'verified'];
const clamp = (n) => Math.max(0, Math.min(1, Number.isFinite(Number(n)) ? Number(n) : 0));

export function routeReflex({ tier = 'native', difficulty = 0, risk = 0, novelty = 0, uncertainty = 0 } = {}) {
  const base = TIERS.includes(tier) ? tier : 'verified'; // Unknown routes fail safe.
  const safeRisk = clamp(risk);
  const safeNovelty = clamp(novelty);
  const safeUncertainty = clamp(uncertainty);
  const safeDifficulty = clamp(difficulty);
  let required = base;
  let reason = 'base-inference';
  if (safeRisk >= 0.75 || (safeRisk >= 0.5 && safeUncertainty >= 0.7)) {
    required = 'verified';
    reason = 'high-risk-or-risk-and-uncertainty';
  } else if (safeNovelty >= 0.85 || (safeNovelty >= 0.35 && safeUncertainty >= 0.9)) {
    required = 'deep';
    reason = 'novel-or-uncertain';
  }
  const resolved = TIERS[Math.max(TIERS.indexOf(base), TIERS.indexOf(required))];
  return {
    version: 'aura-reflex-policy-v1',
    tier: resolved,
    escalated: resolved !== base,
    reason: resolved !== base ? reason : 'base-inference',
    needs_evidence: resolved === 'verified',
    // This is a heuristic indicator, not a calibrated model probability.
    uncertainty_hint: Number(Math.max(safeDifficulty, safeRisk, safeUncertainty).toFixed(4)),
    calibrated: false,
    external_api_required: false,
  };
}
