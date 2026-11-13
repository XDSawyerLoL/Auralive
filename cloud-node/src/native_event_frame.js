// Common immutable semantic representation for local French event candidates.
// No generated text or model hallucination. Every claim remains attributed to
// the user, not to the physical world. Unknown tense is never guessed.
const normalize=value=>String(value??'').toLocaleLowerCase('fr-FR')
 .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
const timeOf=text=>{
 const s=normalize(text);
 if(/\b(?:demain|bientot|plus tard|la semaine prochaine|prochainement)\b/u.test(s))
   return {tense:'future',aspect:'unrealized',time_reference:'relative-future'};
 if(/^[\p{L}-]+\s+(?:a|ont)\s+[\p{L}-]+\s+/u.test(s))
   return {tense:'past',aspect:'completed',time_reference:'relative-past'};
 if(/^[\p{L}-]+\s+(?:avait|avaient)\s+[\p{L}-]+\s+/u.test(s))
   return {tense:'past',aspect:'anterior',time_reference:'relative-past'};
 if(/\b(?:fera|ouvrira|fermera|deplacera|aura|sera|seront)\b/u.test(s))
   return {tense:'future',aspect:'unrealized',time_reference:'relative-future'};
 if(/\b(?:ouvre|ferme|deplace|fait)\b/u.test(s))
   return {tense:'present',aspect:'unspecified',time_reference:'unspecified'};
 return {tense:'unknown',aspect:'unknown',time_reference:'unknown'};
};
export function makeNativeEventFrame(frame,source,{scope='user-asserted',role=null,order=null}={}){
 if(frame?.kind!=='event'||!frame.agent||!frame.predicate||!frame.patient||
   typeof frame.polarity!=='boolean')return null;
 const temporal=timeOf(source);
 const mode=['conditional','condition','consequence','hypothetical','planned','habitual',
  'reported','temporal-underspecified'].includes(scope)?scope:'asserted';
 const asserted=mode==='asserted'&&temporal.tense!=='future';
 return {
   schema:'aura-local-event-frame-v1',kind:'event',
   agent:normalize(frame.agent),predicate:normalize(frame.predicate),
   patient:normalize(frame.patient),voice:frame.voice||'unknown',
   polarity:frame.polarity?'positive':'negative',
   modality:mode,asserted,
   tense:temporal.tense,aspect:temporal.aspect,
   time_reference:temporal.time_reference,
   relation_role:role,sequence_index:order,
   provenance:{type:'user-statement',verification:'unverified',source:frame.source||'user-statement-unverified'},
   parser:frame.parser||'bounded-french-grammar'
 };
}
export function isNativeEventAssertable(event){
 return event?.schema==='aura-local-event-frame-v1'&&event.asserted===true&&
   event.polarity==='positive'&&event.modality==='asserted'&&
   event.provenance?.type==='user-statement'&&event.provenance.verification==='unverified';
}
