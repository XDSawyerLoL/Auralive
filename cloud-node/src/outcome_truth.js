// An action can only succeed when the returned outcome has durable evidence.
// Transport-level completion and a status label alone are never proof.
const WAITING = new Set(['queued', 'leased', 'pending', 'waiting', 'running', 'in-progress', 'processing', 'planning', 'starting']);
const FAILED = new Set(['error', 'failed', 'cancelled', 'canceled', 'no-safe-patch', 'rejected', 'skipped']);
const FINISHED = new Set(['completed', 'complete', 'success', 'succeeded', 'verified', 'done', 'no-change', 'adapted-runtime', 'research-only']);
const PROOF_FIELDS = [
  'evidence', 'evidence_count', 'sources', 'source_urls', 'session_id',
  'conclusion', 'reflection', 'artifact', 'artifacts', 'receipts',
  'result', 'results', 'output', 'changes', 'changed', 'report',
  'diagnosis', 'adaptation', 'validation', 'verified_result',
  'file_sha256', 'sha256', 'executed_actions',
];
function substantial(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'boolean') return value === true;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') {
    // A nested envelope containing only status, confidence or a plan is not evidence.
    return Object.entries(value).some(([key, item]) =>
      !['status', 'ok', 'message', 'reason', 'plan', 'queued', 'executed', 'error', 'id', 'confidence'].includes(key)
      && substantial(item));
  }
  return false;
}
function hasEvidence(value) {
  return PROOF_FIELDS.some((key) => substantial(value[key]));
}
export function classifyInitiativeResult(kind, candidate = {}) {
  const result = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
  const nested = result.result && typeof result.result === 'object' && !Array.isArray(result.result)
    ? result.result
    : {};
  const statuses = [result.status, nested.status]
    .map((status) => String(status || '').trim().toLowerCase())
    .filter(Boolean);
  const queued = Boolean(result.queued || nested.queued);
  const waitingStatus = statuses.some((status) => WAITING.has(status) || status.startsWith('waiting-'));
  const steps = Array.isArray(result.steps) ? result.steps : [];
  const stepFailure = steps.some((step) => step && step.ok === false);
  const stepsProven = steps.length > 0 && steps.every((step) =>
    step && step.ok === true && Object.entries(step).some(([key, value]) =>
      !['ok', 'type', 'status', 'message', 'reason', 'source'].includes(key) && substantial(value)));
  const failure = stepFailure || result.skipped === true || nested.skipped === true || result.ok === false || nested.ok === false
    || statuses.some((status) => FAILED.has(status) || status.endsWith('-rejected'));
  const planOnly = kind === 'operator'
    && (result.executed === false || nested.executed === false)
    && !queued && !waitingStatus && !failure;
  const waiting = !failure && (queued || waitingStatus || planOnly);
  const actualExecution = result.executed === true || nested.executed === true;
  const explicitlyNotExecuted = result.executed === false || nested.executed === false;
  const positive = result.ok === true || nested.ok === true || actualExecution
    || statuses.some((status) => FINISHED.has(status));
  const proven = hasEvidence(result) || hasEvidence(nested) || stepsProven;
  const completed = !waiting && !failure && !explicitlyNotExecuted
    && statuses.every((status) => FINISHED.has(status))
    && positive && proven && (kind !== 'operator' || actualExecution);
  return {
    status: waiting ? 'waiting' : completed ? 'completed' : 'failed',
    executed: completed,
    waiting_for_worker: planOnly,
  };
}
