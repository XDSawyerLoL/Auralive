// Provenance-preserving long-term retrieval from the pre-existing founder
// lessons ledger. Queries never cross from public sessions to founder memory.
const normalize = (value) => String(value || '').toLocaleLowerCase('fr-FR')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const tokenize = (value) => new Set((normalize(value).match(/[a-z0-9]{3,}/g) || [])
  .filter((word) => !['pour','avec','dans','les','des','une','que','qui','est','pas','sur','mais','aux','aura','quantic'].includes(word)));

export function consolidateLessons(rows, queryText, limit = 4) {
  if (!Array.isArray(rows) || !String(queryText || '').trim()) return [];
  const question = tokenize(queryText);
  if (!question.size) return [];
  const unique = new Set();
  const scored = [];
  for (const row of rows) {
    const note = String(row?.content || '').trim().slice(0, 900);
    const key = normalize(row?.lesson_key || note).replace(/\s+/g, ' ').trim();
    if (!note || !key || unique.has(key)) continue;
    unique.add(key);
    const overlaps = [...tokenize(note)].filter(t => question.has(t)).length;
    if (!overlaps) continue;
    const evidence = Math.max(0, Number(row.evidence_count || 0));
    const confidence = Math.max(0, Math.min(1, Number(row.confidence || 0)));
    const relevance = overlaps / question.size;
    scored.push({
      score: relevance * 4 + Math.min(0.6, Math.log2(evidence + 1) * 0.14) + confidence * 0.2,
      memory: {
        kind: 'long-term-lesson',
        note,
        source: String(row.source || 'unknown').slice(0, 100),
        at: row.updated_at || '',
        evidence_count: evidence,
        // Evidence count records repetition, not external fact verification.
        evidence_status: 'stored-lesson-unverified',
        confidence,
      },
    });
  }
  return scored.sort((a, b) => b.score - a.score || String(b.memory.at).localeCompare(String(a.memory.at)))
    .slice(0, Math.max(1, Math.min(6, Math.trunc(Number(limit) || 4))))
    .map(({memory}) => memory);
}
