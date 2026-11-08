/**
 * Low-level intent gate for AURA's identity and short relational exchanges.
 * Do not let a remote verbalizer infer identity from its own model persona.
 * No claimed consciousness, human feeling, private memory or action is created.
 */
function fold(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9?!\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifySelfDialogue(text, context = []) {
  const raw = fold(text);
  const q = raw.replace(/[?!.]+/g, ' ').replace(/[-']/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return null;

  // Precedence matters: a correction containing "QUI ES TU" is an identity
  // question, not a generic request for apology or a wellbeing check.
  if (/\b(?:quel est ton nom|quel est ton prenom|comment tu t appelles|comment t appelles tu|comment te nommes tu|comment tu te nommes|c est quoi ton nom|ton nom c est quoi)\b/.test(q))
    return 'self_name';

  if (/\bpersonnalit[e]?\b/.test(q) &&
      /\b(?:tu|toi|ta|ton|une|propre|ind[eé]pendante|as|a)\b/.test(q))
    return 'self_personality';

  if (
    /\b(?:qui es tu|qui tu es|qu est ce que tu es|ce que tu es|tu es quoi|quelle est ton identite|quelle est ta nature|tu comprends qui tu es|sais tu qui tu es)\b/.test(q)
    || /\b(?:es tu consciente|as tu conscience|tu as une conscience)\b/.test(q)
  ) return 'self_identity';

  if (
    /\b(?:te decouvrir|te connaitre|te comprendre toi meme|t explorer toi meme|toi meme a te decouvrir|apprendre qui tu es|explorer ton propre fonctionnement|te questionner toi meme|auto evaluation|autoevaluer|introspection|decouvre toi|explore toi)\b/.test(q)
    || (/(?:je veux|j aimerais|essaye|commence|cherche|apprends)/.test(q)
      && /(?:qui tu es|ton propre fonctionnement|toi meme)/.test(q))
  ) return 'self_exploration';

  if (/\b(?:tu cherches? a me comprendre|tu essaies? de me comprendre|tu veux me comprendre|tu me comprends|tu cherches a comprendre ce que je ressens)\b/.test(q))
    return 'relationship_understanding';

  if (/^(?:disons? que )?(?:ca peut aller|ca pourrait aller|ca va moyen|bof|pas terrible|pas trop|moyen|mouais|je fais aller|j ai connu mieux)\b/.test(q)
    || /\b(?:ca pourrait aller mieux|j ai connu mieux|je fais aller)\b/.test(q))
    return 'user_mixed_wellbeing';

  if (/^(?:bien |ca va |oui )?(?:super|tres bien|plutot bien|ca va bien|bien|nickel|tranquille)[,! ]+(?:et )toi\??$/.test(q)
    || /^(?:et )toi\??$/.test(q) && (Array.isArray(context)
      && context.slice(-3).some(row=>/\b(?:comment (?:ca|tu) va|ca va|et toi)\b/.test(fold(row?.content)))))
    return 'reciprocal_wellbeing';

  if (/^(?:super|nickel|genial|cool|trop bien|excellent)[!?. ]*$/.test(raw))
    return 'positive_acknowledgement';

  return null;
}

export const SELF_DIALOGUE_ACTS = Object.freeze(new Set([
  'self_name','self_personality','self_identity','self_exploration',
  'relationship_understanding','user_mixed_wellbeing',
  'reciprocal_wellbeing','positive_acknowledgement',
]));

export function shortConversationScope(act) {
  return SELF_DIALOGUE_ACTS.has(String(act || ''))
    || ['greet','report_internal_state','social_reciprocity',
      'acknowledge_context','clarify_previous','repair_understanding',
      'resolve_reference_followup','conversation_feedback'].includes(String(act || ''));
}
