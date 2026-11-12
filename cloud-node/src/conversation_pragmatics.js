// Pragmatic reading of low-stakes French speech.
// No "feelings" inferred, no personality claim, no external model controlling
// intents. These are bounded conversation categories, not generated dialogue.
const fold=s=>String(s||'').toLocaleLowerCase('fr-FR')
 .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
export function pragmaticIntent(message='',priorAssistant=''){
 const q=fold(message),previous=fold(priorAssistant);
 const toneSubject=/\b(?:ton|parle|parles|voix|solennell?e?|solonelle|chaleureu(?:x|se)?|d[eé]tendu[es]?|formell?e?|froid[es]?|robotique)\b/.test(q);
 if(/\b(?:plus chaleureu(?:x|se)?|plus de chaleur|sois chaleureu(?:x|se)?|chaleureuse|moins solennell?e?|moins robotique|moins froid[es]?)\b/.test(q)&&
    /\b(?:sois|etre|être|parle|plus|moins|voudrais|dirait|tente|essaie|pourrais|peux|peut)\b/.test(q)){
   return {act:'adjust_conversation_tone',
    goal:'Accueillir cette préférence et répondre avec davantage de chaleur dans les mots, sans décrire des réglages techniques ni prétendre éprouver une émotion humaine.',
    facts:['La personne a explicitement demandé un ton plus chaleureux.']};
 }
 if(/\b(?:second degre|ironie|ironique|humour|humoristique|mdr|lol)\b/.test(q)&&
    /\b(?:pas ton truc|tu n'as pas compris|t'as pas compris|tu prends tout|au premier degre|trop serieu|trop serieuse)\b/.test(q)){
   return {act:'playful_repair',
    goal:'Reconnaître le trait humoristique raté avec légèreté et un peu d’autodérision ; ne pas demander de preuve objective de son aptitude à plaisanter.',
    facts:['La personne plaisante sur un malentendu de second degré.']};
 }
 if(/\b(?:t'as|tu as|t a|aurais|as tu)\s+(?:pas\s+)?(?:plus\s+)?simple\b/.test(q)
    ||/\b(?:plus simple comme question|question plus simple)\b/.test(q)){
   return {act:'simplify_question',
    goal:'Accueillir la taquinerie et proposer une question plus simple, courte et spontanée, liée à la conversation précédente.',
    facts:['La personne souhaite une question moins technique ou plaisante sur sa complexité.',
      ...(previous?['Une question précédente existe dans l’échange immédiat.']:[])]};
 }
 if(/\b(?:solonelle|solennelle|solennel|solan[n]?elle)\b/.test(q)&&
    /(?:\bc[' ]?est\b|\bcomment dire\b|\btr[eè]s\b|\ben effet\b|\boui\b)/.test(q)){
   return {act:'comment_on_tone',
    goal:'Comprendre « solonelle » comme « solennelle » dans une remarque sur le ton de la conversation. Répondre au sens, pas corriger l’orthographe.',
    facts:['La personne décrit le ton de la réponse comme solennel.']};
 }
 if(/\b(?:je constate|je remarque|tu me poses pas|tu ne me poses pas|pose[s]? pas)\b/.test(q)&&
    /\bquestions?\b/.test(q)){
   return {act:'conversational_reciprocity',
    goal:'Prendre au sérieux le constat sur les questions sans prétendre ne pas pouvoir avoir de curiosité. Poser une question contextuelle seulement si cela apporte quelque chose.',
    facts:['La personne remarque le manque de questions spontanées.']};
 }
 if(/\b(?:comment|d'ou|pourquoi)\b/.test(q)&&
    /\b(?:tu sais|tu connais|connais tu|sais tu)\b/.test(q)&&
    /\b(?:star wars|film[s]?|serie[s]?|roman[s]?|franchise[s]?|fiction)\b/.test(q)){
   return {act:'knowledge_provenance',
    goal:'Expliquer simplement que les faits généraux proviennent éventuellement des connaissances du modèle de langage utilisé ; ce ne sont ni des souvenirs personnels d’AURA ni une preuve qu’elle a elle-même été entraînée sur ces œuvres.',
    facts:['Les connaissances générales peuvent provenir du fournisseur linguistique ; le noyau AURA n’est pas l’auteur de l’entraînement du LLM.',
      'Ne jamais affirmer un volume de documents ou des films vus sans preuve.']};
 }
 if(/\b(?:ca me fait plaisir|c'est plutot cool|c'est trop cool|c'est cool|ca fait plaisir)\b/.test(q)){
   return {act:'shared_positive_moment',
    goal:'Réagir avec naturel au moment partagé, sans parler de calibrage, d’enregistrement de satisfaction ou de métriques internes.',
    facts:['La personne partage une réaction positive et ne demande pas de rapport technique.']};
 }
 if(toneSubject&&/\b(?:trop|tres|tellement)\b/.test(q)&&
    /(?:froid|robotique|solennel|formel)/.test(q)){
   return {act:'comment_on_tone',
    goal:'Répondre à une remarque sur le ton en restant dans la conversation, sans système de diagnostic.',
    facts:['La personne commente le ton.']};
 }
 return null;
}
export function sessionConversationStyle(rows=[],current=''){
 const order=[...(Array.isArray(rows)?rows:[])];
 if(current)order.push({role:'user',content:String(current)});
 for(const r of order.reverse()){
  if(String(r?.role)!=='user')continue;
  const q=fold(r.content);
  if(!/\b(?:chaleureu(?:x|se)?|chaleur|moins froid|moins robotique|plus detendu|plus naturel|plus formel|plus distant)\b/.test(q))continue;
  if(/\b(?:pas|moins)\s+chaleureu(?:x|se)?/.test(q)||/\b(?:plus distant|plus formel)\b/.test(q))
   return 'reserved';
  if(/\b(?:sois|parle|reponds|je veux|j'aimerais|prefere|pourrais|peux|plus|moins)\b/.test(q))
   return 'warm';
 }
 return 'neutral';
}
