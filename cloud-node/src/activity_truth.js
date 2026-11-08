// AURA activity truth: recorded plans are never evidence of ongoing work.
export const ACTIVE_STATUS_WINDOW_MS = 24 * 60 * 60 * 1000;
export function parseRecordedTime(input) {
  if (!input) return null;
  const t = input instanceof Date ? input.getTime() : Date.parse(String(input));
  return Number.isFinite(t) ? t : null;
}
export function activityEvidence({status,updated_at,source='unknown',execution_receipt=null}={},
  {nowMs=Date.now(),maxAgeMs=ACTIVE_STATUS_WINDOW_MS}={}) {
  const recordedStatus=String(status||'unknown');
  const timestamp=parseRecordedTime(updated_at);
  const age=timestamp===null?null:Math.max(0,nowMs-timestamp);
  const fresh=age!==null && age<=maxAgeMs && timestamp<=nowMs+5*60*1000;
  // Only a separately verified execution receipt proves actual work.
  const receiptAt=parseRecordedTime(execution_receipt?.verified_at);
  const receiptVerified=Boolean(execution_receipt?.ok===true && execution_receipt?.evidence_id
    && receiptAt!==null && receiptAt<=nowMs && nowMs-receiptAt<=maxAgeMs);
  return {
    origin:source,
    source_status:recordedStatus,
    recorded_at:timestamp===null?'':new Date(timestamp).toISOString(),
    stale:!fresh,
    recorded_status_current:fresh,
    execution_verified:receiptVerified,
    source_of_execution:receiptVerified?'verified-execution-receipt':'none',
    live_ci_verified:false,
    evidence_status:receiptVerified?'verified-execution'
      :!fresh?'stale-record':'recorded-status-only',
    note:!fresh
      ? 'Donnée trop ancienne ou sans date : aucun travail ou blocage actuel ne peut être affirmé.'
      : 'État enregistré récemment, mais non preuve de tâche exécutée ni de CI vérifiée.',
  };
}
export function groundAgenda(snapshot={},opts={}){
  const evidence=activityEvidence({
    status:snapshot.status,
    updated_at:snapshot.last_updated_at||snapshot.since,
    source:snapshot.source||'agenda',
    execution_receipt:snapshot.execution_receipt,
  },opts);
  const title=String(snapshot.current||'').replace(/\s+/g,' ').trim().slice(0,600);
  const blocker=String(snapshot.blocker||'').replace(/\s+/g,' ').trim().slice(0,600);
  return {
    ...snapshot,
    current:title,
    blocker:evidence.execution_verified?blocker:'',
    last_recorded_blocker:blocker,
    status:evidence.stale?'stale':String(snapshot.status||'recorded'),
    source_status:evidence.source_status,
    ...evidence,
    status_message:evidence.execution_verified
      ?'Exécution vérifiée par reçu récent.'
      :evidence.stale?'Ancien état enregistré, à revérifier.'
        :'État de tâche enregistré, exécution non confirmée.',
  };
}
