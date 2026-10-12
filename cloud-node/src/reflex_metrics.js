// Reflex decisions can only be correlated to outcomes when the caller
// supplies the actual decision ID. Missing IDs must never be silently inferred.
const TIERS = ['native', 'fast', 'deep', 'verified'];
const clamp = (number) => Math.max(0, Math.min(1, Number(number) || 0));

export function summarizeReflexObservations(rows = []) {
  const valid = Array.isArray(rows) ? rows.filter(row => row && TIERS.includes(String(row.compute_tier))) : [];
  const byTier = Object.fromEntries(TIERS.map(tier => [tier, { observations: 0, failures: 0, machine_verified: 0 }]));
  for (const row of valid) {
    const bucket = byTier[String(row.compute_tier)];
    bucket.observations++;
    if (Number(row.outcome_ok) === 0) bucket.failures++;
    if (row.evidence_level === 'machine-verified') bucket.machine_verified++;
  }
  return {
    version: 'aura-reflex-evidence-v1',
    observations: valid.length,
    by_tier: byTier,
    machine_verified: valid.filter(row => row.evidence_level === 'machine-verified').length,
    // Observational association is not a trained or calibrated policy.
    calibrated: false,
    causal_accuracy_demonstrated: false,
    status: valid.length ? 'observational-tracking' : 'awaiting-correlated-outcomes',
  };
}

export function reflexOutcomeRecord(assessment, payload) {
  if (!assessment?.decision_id || String(payload?.reflex_decision_id || '') !== assessment.decision_id) return null;
  if (!TIERS.includes(String(assessment.compute_tier))) return null;
  // No external payload can self-certify itself as a machine verification.
  return {
    decision_id: assessment.decision_id,
    compute_tier: assessment.compute_tier,
    difficulty: clamp(assessment.difficulty),
    risk: clamp(assessment.risk),
    novelty: clamp(assessment.novelty),
    uncertainty: clamp(assessment.uncertainty),
    outcome_ok: payload?.ok === true ? 1 : 0,
    evidence_level: 'reported',
    source: String(payload?.event_type || 'outcome').slice(0, 120),
  };
}
