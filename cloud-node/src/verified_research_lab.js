import { createHash } from 'node:crypto';

// An isolated research component. It has no network, shell, database or product side effects.
const safeId = (value) => typeof value === 'string'
  && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/.test(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const hash = (value) => createHash('sha256').update(String(value)).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));

function normalize(candidate) {
  if (!candidate || !safeId(candidate.id)) throw new Error('invalid research candidate id');
  if (!Number.isInteger(candidate.costUnits) || candidate.costUnits < 0) {
    throw new Error('invalid research costUnits');
  }
  if (!finite(candidate.expectedValue) || candidate.expectedValue < 0 || candidate.expectedValue > 1e6) {
    throw new Error('invalid research expectedValue');
  }
  return {
    id: candidate.id,
    costUnits: candidate.costUnits,
    expectedValue: candidate.expectedValue,
    sideEffects: candidate.sideEffects === true,
  };
}

// Exact 0/1 knapsack baseline, deliberately classical, bounded and deterministic.
// 'Quantum-inspired' methods must beat this baseline at identical compute budgets.
export function planResearchBudget(candidates, budgetUnits) {
  if (!Number.isInteger(budgetUnits) || budgetUnits < 0 || budgetUnits > 2000) {
    throw new Error('research budget must be an integer between 0 and 2000');
  }
  if (!Array.isArray(candidates) || candidates.length > 64) {
    throw new Error('research plan accepts at most 64 candidates');
  }
  const normalized = candidates.map(normalize).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) {
    throw new Error('duplicate research candidate');
  }
  const best = Array.from({ length: budgetUnits + 1 }, () => ({ value: 0, ids: [], cost: 0 }));
  for (const item of normalized) {
    for (let budget = budgetUnits; budget >= item.costUnits; budget -= 1) {
      const prev = best[budget - item.costUnits];
      const option = {
        value: prev.value + item.expectedValue,
        ids: [...prev.ids, item.id],
        cost: prev.cost + item.costUnits,
      };
      const current = best[budget];
      if (option.value > current.value + 1e-10
        || (Math.abs(option.value - current.value) <= 1e-10 && option.cost < current.cost)) {
        best[budget] = option;
      }
    }
  }
  const chosen = best[budgetUnits];
  return {
    selected: chosen.ids,
    totalCostUnits: chosen.cost,
    totalExpectedValue: Number(chosen.value.toFixed(8)),
    budgetUnits,
    algorithm: 'exact-classical-knapsack-v1',
  };
}

export class VerifiedResearchLab {
  static VERSION = 'aura-verified-research-lab-v0.1';

  constructor({ budgetUnits = 10, maxRecords = 500 } = {}) {
    planResearchBudget([], budgetUnits);
    if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 5000) {
      throw new Error('invalid research history limit');
    }
    this.budgetUnits = budgetUnits;
    this.maxRecords = maxRecords;
    this.records = [];
  }

  // No claimed learning from reports lacking a human/external deterministic verifier.
  historicalRate(candidateId) {
    const verified = this.records.filter((row) =>
      row.candidateId === candidateId && ['pass', 'fail'].includes(row.status));
    const successes = verified.filter((row) => row.status === 'pass').length;
    return (successes + 1) / (verified.length + 2); // Laplace smoothing; not calibrated probability.
  }

  async run({ objective, candidates, approvedSideEffects = [] } = {}) {
    if (typeof objective !== 'string' || !objective.trim()) throw new Error('research objective required');
    if (!Array.isArray(candidates)) throw new Error('research candidates required');
    const approvals = new Set(approvedSideEffects);
    const permitted = [];
    const blocked = [];
    for (const candidate of candidates) {
      const item = normalize(candidate);
      if (item.sideEffects && !approvals.has(item.id)) {
        blocked.push({ candidateId: item.id, reason: 'side-effects-not-approved' });
        continue;
      }
      permitted.push({ ...item, expectedValue: item.expectedValue * this.historicalRate(item.id) });
    }
    const plan = planResearchBudget(permitted, this.budgetUnits);
    const index = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const results = [];

    for (const candidateId of plan.selected) {
      const candidate = index.get(candidateId);
      const base = {
        candidateId,
        objectiveHash: hash(objective),
        costUnits: candidate.costUnits,
      };
      let entry;
      try {
        if (typeof candidate.execute !== 'function' || typeof candidate.verify !== 'function'
          || candidate.execute === candidate.verify) {
          entry = { ...base, status: 'unverified', reason: 'independent-verifier-missing' };
        } else {
          const result = await candidate.execute();
          const proof = await candidate.verify(result);
          if (typeof proof?.ok !== 'boolean' || !safeId(proof.verifierId)
            || !safeId(proof.evidenceId) || proof.verifierId === candidateId) {
            entry = { ...base, status: 'unverified', reason: 'invalid-verification-contract' };
          } else {
            entry = {
              ...base,
              status: proof.ok ? 'pass' : 'fail',
              verifierId: proof.verifierId,
              evidenceId: proof.evidenceId,
            };
          }
        }
      } catch (error) {
        entry = { ...base, status: 'error', reason: String(error?.code || 'experiment-error').slice(0, 80) };
      }
      // Never store objective, experiment inputs or raw outputs in this ledger.
      this.records.push(entry);
      if (this.records.length > this.maxRecords) this.records.shift();
      results.push(entry);
    }
    return {
      schema: VerifiedResearchLab.VERSION,
      plan,
      blocked,
      results,
      counts: {
        pass: results.filter((row) => row.status === 'pass').length,
        fail: results.filter((row) => row.status === 'fail').length,
        unverified: results.filter((row) => row.status === 'unverified').length,
        error: results.filter((row) => row.status === 'error').length,
      },
      claim: 'bounded-experiment-orchestration-only-not-general-learning',
    };
  }

  snapshot() {
    return clone({ schema: VerifiedResearchLab.VERSION, records: this.records });
  }
}
