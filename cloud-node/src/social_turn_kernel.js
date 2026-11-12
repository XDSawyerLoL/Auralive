// AURA functional conversational micro-circuit.
// Current same-session turns and explicit wording are its sole inputs.
// No inference of consciousness, subjective emotion, or unseen LLM reasoning.
const fold=x=>String(x??'').toLocaleLowerCase('fr-FR').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'")
  .replace(/\s+/g,' ').trim().replace(/[.!?]+$/,'').trim();
const compact=x=>String(x??'').replace(/\s+/g,' ').trim().slice(0,550);
const ALLOWED=new Set(['social_wellbeing_ack','clarify_unrequested_continuation',
  'unfinished_address','explain_apparent_curiosity']);
export function socialTurnDecision(text='',context=[]){
 const q=fold(text);
 const rows=Array.isArray(context)?context.filter(x=>['assistant','user'].includes(x?.role)&&compact(x?.content)).slice(-6):[];
 const lastAssistant=[...rows].reverse().find(x=>x.role==='assistant');
 const previous=compact(lastAssistant?.content);
 const prev=fold(previous);
 const priorUser=[...rows].reverse().find(x=>x.role==='user');
 const lastUser=compact(priorUser?.content);
 const lastUserFold=fold(lastUser);
 let act=null,reason='';
 if(/^(?:bien merci|tres bien merci|ca va bien merci|oui ca va merci|ca va merci|nickel merci|bien et merci)$/.test(q)
     && /\b(?:comment (?:ca|tu) va|comment vas tu|comment vas-tu|comment allez vous|tu vas bien|ca va)[?]?/.test(prev)){
  act='social_wellbeing_ack';reason='user-confirmed-wellbeing-after-assistant-question';
 }else if(/^(?:comment ca|comment ca ?|comment|c'est a dire|qu'est ce que tu veux dire|tu veux dire quoi|pourquoi tu dis ca)$/.test(q)
      && /\b(?:on continue|continuons|on reprend|on poursuit)\b/.test(prev)){
  act='clarify_unrequested_continuation';reason='user-asks-clarification-of-assistant-continuation-proposal';
 }else if(/^(?:tu|toi|tu\.\.\.|tu\.?)$/.test(q) && q.length<=5){
  act='unfinished_address';reason='incomplete-address-not-new-independent-topic';
 }else if(/\b(?:tu (?:as l'air|sembl(?:es|e))|t'as l'air)\s+(?:un peu )?(?:intrigu[eé]e?|curieu(?:se|x)|interess[eé]e?)\b/.test(q)
       && /\b(?:je me trompe|non|c'est ca|c'est bien ca|ou pas)\b/.test(q)){
  act='explain_apparent_curiosity';reason='interlocutor-attributed-curiosity-needs-observable-basis';
 }
 if(!ALLOWED.has(act))return null;
 return Object.freeze({act,reason,previous_assistant:previous,
   previous_user:lastUser,source:'same-session-conversation-and-rule',
   speaker_role:'aura',inner_feeling_claim:false,provider_intent_authority:false,
   concise:true,
   // This is a planning objective, not a hidden thought / generated speech.
   goal:{
    social_wellbeing_ack:'Accueillir sa réponse simplement, sans proposer de reprendre un travail qu’elle n’a pas mentionné.',
    clarify_unrequested_continuation:'Expliquer exactement sa propre proposition de poursuivre la conversation, sans inventer un projet à reprendre.',
    unfinished_address:'Laisser de la place à une phrase inachevée, sans inventer trois interprétations.',
    explain_apparent_curiosity:'Relier la question précédente à son contexte observé sans présenter une intrigue subjective comme prouvée.',
   }[act],
 });
}
export function nativeSocialReply(plan={}){
 const social=plan.social_turn;
 if(!social||!ALLOWED.has(social.act)||social.act!==plan.act)return '';
 const prior=fold(social.previous_assistant),user=fold(social.previous_user);
 switch(social.act){
  case 'social_wellbeing_ack':
   return 'Tant mieux.';
  case 'clarify_unrequested_continuation':
   return 'Je proposais simplement de poursuivre notre échange, pas de reprendre une tâche précise. Ma formulation était ambiguë.';
  case 'unfinished_address':
   return 'Oui, je t’écoute.';
  case 'explain_apparent_curiosity':
   if(/\b(?:tu veux parler de moi|tu voulais dire|dis.m.en un peu plus|pas sur de saisir|pas sure de saisir|je ne comprends pas)\b/.test(prior))
     return 'Ma question donnait cette impression, oui. Tu avais commencé une phrase sans la finir, alors j’essayais d’en comprendre la suite.';
   if(user==='tu'||user==='toi')
     return 'Ça peut en donner l’impression. Ton message était inachevé et j’essayais simplement de comprendre ce que tu voulais dire.';
   return 'C’est possible que mon ton donne cette impression. J’ai posé une question pour mieux comprendre, pas parce que je peux confirmer une émotion ressentie.';
  default:return '';
 }
}
export const NATIVE_SOCIAL_ACTS=Object.freeze(ALLOWED);
