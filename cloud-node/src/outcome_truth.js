// Pure outcome classification shared by Command Center and long-horizon missions.
// A plan, a queued action or a missing result is not a completed operation.
const WAITING = new Set(['queued', 'leased', 'pending', 'waiting']);
const FAILED = new Set(['error', 'failed', 'cancelled', 'canceled', 'no-safe-patch', 'rejected', 'skipped']);

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
  const failure = result.skipped === true || nested.skipped === true || result.ok === false || nested.ok === false
    || statuses.some((status) => FAILED.has(status) || status.endsWith('-rejected'));
  const planOnly = kind === 'operator'
    && (result.executed === false || nested.executed === false)
    && !queued
    && !waitingStatus
    && !failure;
  const waiting = !failure && (queued || waitingStatus || planOnly);
  const actualExecution = result.executed === true || nested.executed === true;
  const explicitlyNotExecuted = result.executed === false || nested.executed === false;
  const hasResult = Object.keys(result).length > 0;
  const completed = !waiting && !failure && hasResult && !explicitlyNotExecuted
    && (kind !== 'operator' || actualExecution);

  return {
    status: waiting ? 'waiting' : completed ? 'completed' : 'failed',
    executed: completed,
    waiting_for_worker: planOnly,
  };
}
