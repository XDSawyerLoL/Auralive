// Cooperative mission scheduling: Paperclip-inspired fairness, no new runtime.
// AURA remains single-dispatch; this is NOT a multi-replica atomic lease.
const ACTIVE = new Set(['planning', 'running', 'waiting']);
export function missionRotation(rows, afterId = '') {
  if (!Array.isArray(rows)) return [];
  const eligible = rows.filter((m) => m && m.id && ACTIVE.has(String(m.status || '')));
  eligible.sort((a, b) =>
    Number(b.priority || 0) - Number(a.priority || 0)
    || String(a.updated_at || '').localeCompare(String(b.updated_at || ''))
    || String(a.id).localeCompare(String(b.id)));
  const previous = eligible.findIndex((m) => String(m.id) === String(afterId || ''));
  const start = previous < 0 ? 0 : (previous + 1) % eligible.length;
  return [...eligible.slice(start), ...eligible.slice(0, start)];
}

export function selectNextMission(rows, afterId = '') {
  return missionRotation(rows, afterId)[0] || null;
}
