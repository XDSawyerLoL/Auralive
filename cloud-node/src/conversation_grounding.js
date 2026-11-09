// Conversation grounding for role direction and memory relevance.
// This module does NOT prescribe AURA's dialogue; it determines what
// the current interlocutor is asking and what evidence is admissible.
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
const topicStop=new Set('je tu il elle nous vous ils elles mon ma mes ton ta tes son sa ses le la les de des du une un dans pour avec vers que qui quoi quel quelle comment pourquoi ou est suis es c ce ca ça et donc alors mais pas ne non oui au aux a à on me te se lui leur mon état moi toi maintenant salut bonjour reponds peux peux-tu vraiment etre être juste simplement'.split(' '));
const tokenize=s=>new Set((fold(s).match(/[a-z0-9]{4,}/g)||[]).filter(x=>!topicStop.has(x)));
export function socialPerspective(text=''){
 const q=fold(text).replace(/[?!.,:;'-]+/g,' ').replace(/\s+/g,' ').trim();
 // First-person subject asks if they are bothering AURA.
 if(/^(?:(?:est ce que|dis moi|dit moi)\s+)?(?:je|j)\s+(?:te|t)\s+(?:derange|embete|gene|interromps)(?:\s+(?:un peu|trop|la|encore|pas))?$/.test(q)||
    /^(?:est ce que )?(?:ca|cela) te derange(?:\s+(?:que je (?:te parle|pose une question)))?$/.test(q)||
    /^(?:tu|t)\s+(?:es|serais)\s+(?:derange|gene)(?:e)?\s+(?:si je (?:te parle|pose une question))$/.test(q))
  return {act:'user_asks_if_interrupting',actor:'user',target:'aura',subject:'user',certainty:'explicit-pronouns'};
 // Second-person subject says AURA is bothering the user.
 if(/^(?:(?:est ce que|dis moi)\s+)?(?:tu|t)\s+(?:me|m)\s+(?:deranges|embetes|genes|interromps)(?:\s+(?:la|trop|encore|pas))?$/.test(q)||
    /^(?:tu|t)\s+(?:me|m)\s+(?:derange|embete|gene)(?:s)?(?:\s+(?:un peu|trop|la|encore))?$/.test(q)||
    /^(?:je|j)\s+(?:suis|me sens)\s+(?:derange|gene)(?:e)?\s+(?:par toi|quand tu me parles)$/.test(q))
  return {act:'user_reports_aura_interrupts',actor:'aura',target:'user',subject:'aura',certainty:'explicit-pronouns'};
 return null;
}
export const CURRENT_TURN_ONLY=new Set([
 'user_asks_if_interrupting','user_reports_aura_interrupts','greet',
 'user_mixed_wellbeing','positive_acknowledgement','reciprocal_wellbeing',
 'acknowledge_unrequested','relationship_repair','conversation_feedback'
]);
export function conversationMemoryPolicy({act='',message='',facts=[]}={}){
 if(CURRENT_TURN_ONLY.has(act))return {scope:'current-turn',allowProjectMemory:false,reason:'social-turn'};
 const q=fold(message);
 // Explicit requests for continuity may use historical context; still
 // require cited dates and evidence of execution.
 const explicit=/\b(?:avant|dernier|derniere|souviens|memoire|historique|depuis|notre projet|ci|github|serveur|travail|tache|mission)\b/.test(q);
 const relevantTerms=tokenize(q);
 const relevantFact=(facts||[]).some(f=>{
   const terms=tokenize(f);return [...terms].some(x=>relevantTerms.has(x));
 });
 return {scope:explicit||relevantFact?'relevant-history':'current-turn',
   allowProjectMemory:Boolean(explicit||relevantFact),
   reason:explicit?'explicit-reference':relevantFact?'topical-overlap':'no-topic-evidence'};
}
export function isUnrequestedTechnicalDigression(text,plan={}){
 const policy=plan.memory_policy||conversationMemoryPolicy({
   act:plan.act,message:plan.user_text,facts:plan.facts,
 });
 if(policy.allowProjectMemory||plan.activity_evidence?.execution_verified===true)return false;
 const q=fold(text);
 const debug=/\b(?:noyau persistant|noyau decisionnel|en tant que noyau|etat computationnel|modele acquis|modele de langage|organisme computationnel|schema decisionnel)\b/;
 const oldTasks=/\b(?:ci defaillant|ci en echec|pipeline ci|github actions|ancien blocage|relance du ci|relancer le ci)\b/;
 const current=fold(plan.user_text||'');
 return debug.test(q)||oldTasks.test(q)&&!/\b(?:ci|github|pipeline|integration continue)\b/.test(current);
}
