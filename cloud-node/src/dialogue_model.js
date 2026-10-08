const STOP = new Set([
  'le','la','les','un','une','des','de','du','d','a','à','au','aux','et','ou','mais','donc','or','ni','car',
  'je','tu','il','elle','on','nous','vous','ils','elles','me','te','se','moi','toi','lui','leur','y','en',
  'ce','cet','cette','ces','ca','ça','cela','c','est','sont','etre','être','ai','as','avons','avez','ont',
  'que','qu','qui','quoi','dont','ou','où','pour','par','avec','sans','sur','sous','dans','ici','la','là',
]);

function clean(value, limit = 1200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function fold(value) {
  return clean(value)
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9?!.'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value) {
  return fold(value)
    .replace(/[?!.'-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP.has(word));
}

function topicTerms(value, limit = 8) {
  const counts = new Map();
  for (const word of words(value)) counts.set(word, (counts.get(word) || 0) + 1);
  return [...counts.entries()]
    .sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
}

function overlap(a, b) {
  const left = new Set(topicTerms(a, 16));
  const right = new Set(topicTerms(b, 16));
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const item of left) if (right.has(item)) common += 1;
  return common / Math.max(1, Math.min(left.size, right.size));
}

function latest(context, role) {
  return [...context].reverse().find((row) => String(row?.role || '') === role) || null;
}

function previousDistinct(context, role, currentText) {
  const normalized = fold(currentText);
  return [...context].reverse().find((row) =>
    String(row?.role || '') === role && fold(row?.content || '') !== normalized
  ) || null;
}

function correctionTarget(text) {
  const q = fold(text);
  const patterns = [
    /\b(?:non|nan),?\s+(?:je\s+)?(?:parle|parlais|parlait)\s+(?:de|du|des)\s+(.+)/,
    /\b(?:non|nan),?\s+c'?est\s+(.+?)\s+dont\s+je\s+parle/,
    /\bpas\s+(?:ca|ça|cela),?\s+(?:je\s+)?(?:parle|parlais)\s+(?:de|du|des)\s+(.+)/,
    /\bje\s+veux\s+dire\s+(.+)/,
  ];
  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match?.[1]) return clean(match[1].replace(/[?!.]+$/g, ''), 320);
  }
  return '';
}

function looksLikeDirective(q) {
  return /^(?:fais|fait|corrige|regle|règle|mets|met|ajoute|retire|supprime|ouvre|lance|continue|analyse|verifie|vérifie|cherche|trouve|teste|audite|integre|intègre)\b/.test(q)
    || /\b(?:je veux que tu|il faut que tu|peux-tu|peux tu|est-ce que tu peux|est ce que tu peux)\b/.test(q);
}

function looksLikeClarification(q) {
  const stripped = q.replace(/-/g, ' ').replace(/[?!.]+$/g, '').replace(/\s+/g, ' ').trim();
  return [
    "c'est a dire",'c est a dire','cad','comment ca','comment ça','pourquoi',
    'et donc','donc','precise','précise','explique','comment ca marche','comment ça marche',
    'tu veux dire quoi',"qu'est ce que tu veux dire",'qu est ce que tu veux dire',
  ].includes(stripped)
    || /^(?:pourquoi|comment|en quoi)\s*(?:ca|ça|cela|c')?\s*\??$/.test(q);
}

function looksLikeAcknowledgement(q) {
  return /^(?:hum+|hm+|hmm+|ok|okay|d'accord|d accord|je vois|ah|aha|ouais|oui|non|mouais)[?!.]*$/.test(q);
}

function hasAnaphora(q) {
  return /\b(?:ca|ça|cela|ceci|cette?|celui|celle|ceux|celles|la-dessus|là-dessus|la dessus|là dessus|dessus|ainsi|donc|alors)\b/.test(q);
}

export class DialogueStateTracker {
  static VERSION = 'aura-dialogue-state-v2';

  analyze(text, context = []) {
    const raw = clean(text);
    const q = fold(raw);
    const rows = (Array.isArray(context) ? context : [])
      .map((row) => ({
        role: String(row?.role || ''),
        content: clean(row?.content || '', 900),
      }))
      .filter((row) => row.content);
    const previousAssistant = previousDistinct(rows, 'assistant', raw) || latest(rows, 'assistant');
    const previousUser = previousDistinct(rows, 'user', raw) || latest(rows, 'user');
    const tokenCount = q ? q.split(/\s+/).length : 0;
    const contentTerms = topicTerms(raw, 8);
    const correction = correctionTarget(raw);
    const question = q.includes('?') || /^(?:qui|que|quoi|quand|ou|où|comment|pourquoi|combien|quel|quelle|quels|quelles|est-ce|est ce)\b/.test(q);
    const acknowledgement = looksLikeAcknowledgement(q);
    const clarification = looksLikeClarification(q);
    const anaphora = hasAnaphora(q);
    const directive = looksLikeDirective(q);
    const contextOverlap = previousAssistant ? overlap(raw, previousAssistant.content) : 0;

    let move = 'statement';
    if (correction) move = 'correction';
    else if (clarification && previousAssistant) move = 'clarification';
    else if (acknowledgement) move = 'acknowledgement';
    else if (
      previousAssistant
      && tokenCount <= 10
      && (anaphora || (question && contextOverlap < 0.35 && contentTerms.length <= 1))
    ) move = 'reference_followup';
    else if (directive) move = 'directive';
    else if (question) move = 'question';

    const anchor = previousAssistant?.content || previousUser?.content || '';
    const topics = [...new Set([
      ...contentTerms.slice(0, 6),
      ...(tokenCount <= 10 ? topicTerms(anchor, 6) : []),
    ])].slice(0, 10);

    return {
      version: DialogueStateTracker.VERSION,
      move,
      raw,
      token_count: tokenCount,
      is_question: question,
      is_short: tokenCount <= 10,
      has_anaphora: anaphora,
      correction_target: correction,
      reference_text: anaphora || clarification || move === 'reference_followup'
        ? clean(previousAssistant?.content || '', 600)
        : '',
      previous_assistant: clean(previousAssistant?.content || '', 600),
      previous_user: clean(previousUser?.content || '', 600),
      topic_terms: topics,
      topic_continuity: Number(contextOverlap.toFixed(4)),
    };
  }
}
