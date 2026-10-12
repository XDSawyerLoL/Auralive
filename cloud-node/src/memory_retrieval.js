// Claude-Mem-inspired bounded retrieval over AURA's existing MySQL experiences.
// Local ranking only; provenance and conversation-session boundary are preserved.
function terms(value) {
  return new Set(String(value || '').toLocaleLowerCase('fr-FR').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{3,}/g) || []);
}
function identity(note) {
  return String(note || '').toLocaleLowerCase('fr-FR').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}
export function retrieveExperiences(rows, { query = '', limit = 6 } = {}) {
  if (!Array.isArray(rows)) return [];
  const wanted = terms(query);
  const bounded = Math.max(1, Math.min(12, Math.trunc(Number(limit) || 6)));
  const seen = new Set();
  const scored = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || !String(row.note || '').trim()) continue;
    const key = identity(row.note);
    if (seen.has(key)) continue;
    seen.add(key);
    const overlap = [...terms(row.note)].filter((word) => wanted.has(word)).length;
    const relevant = wanted.size ? overlap / Math.max(1, Math.min(wanted.size, 8)) : 0;
    const correction = row.kind === 'user-correction' ? 0.12 : 0;
    scored.push({ row, i, score: relevant * 2 + correction + 0.5 / (1 + i) });
  }
  return scored.sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, bounded).sort((a, b) => b.i - a.i)
    .map(({ row }) => row);
}
