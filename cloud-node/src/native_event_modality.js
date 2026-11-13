// Modality and event-scope analysis is kept separate from factual question answering.
// A quoted user sentence is NEVER evidence that an event happened in the real world.
const fold=value=>String(value||'').toLocaleLowerCase('fr-FR')
 .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
const completedPast=/^[\p{L}-]+\s+(?:a|ont)\s+[\p{L}-]+\s+/u;
const habitual=/\b(?:chaque|tous les|toutes les|habituellement|generalement|d'habitude|souvent|toujours)\b/u;
const future=/\b(?:demain|bientot|plus tard|la semaine prochaine|fera|ouvrira|fermera|deplacera|va\s+\p{L}+er)\b/u;
const hypothetical=/\b(?:pourrait|devrait|voudrait|aurait|serait|peut etre|supposons|imaginons|eventuellement)\b/u;
const reporting=/\b(?:dit que|affirme que|pense que|croit que|pretend que|imagine que)\b/u;
const frameOf=(part,parser)=>{
 const frame=parser(part);
 return frame?.kind==='event'?{...frame,actuality:'user-claimed-event'}:null;
};
export function classifyFrenchEventScope(source){
 const s=fold(source);
 if(!s||s.length>500||/[?？\n]/u.test(s))return {scope:'unknown',asserted:false};
 if(/^(?:si|a condition que|dans le cas ou)\b/u.test(s))
   return {scope:'conditional',asserted:false};
 if(reporting.test(s))return {scope:'reported',asserted:false};
 if(hypothetical.test(s))return {scope:'hypothetical',asserted:false};
 if(habitual.test(s))return {scope:'habitual',asserted:false};
 if(future.test(s))return {scope:'planned',asserted:false};
 if(/\b(?:une fois que|lorsque|quand)\b/u.test(s))
   return {scope:'temporal-underspecified',asserted:false};
 return {scope:'user-asserted',asserted:true};
}
export function analyzeFrenchEventRelations(source,parseStatement){
 if(typeof parseStatement!=='function')return {scope:'unknown',events:[],relations:[]};
 const s=fold(source).replace(/[.!]\s*$/u,'');
 const base=classifyFrenchEventScope(s);
 let a=s.match(/^(.+?)\s+une fois que\s+(.+)$/u);
 if(a){
   const successor=frameOf(a[1],parseStatement),predecessor=frameOf(a[2],parseStatement);
   const bothCompleted=completedPast.test(a[1])&&completedPast.test(a[2]);
   const assert=bothCompleted&&base.scope==='temporal-underspecified'&&
      !habitual.test(s)&&!future.test(s)&&!hypothetical.test(s);
   const events=[predecessor,successor].filter(Boolean).map((event,i)=>({
     ...event,scope:assert?'user-asserted':'temporal-underspecified',asserted:assert,
     relation_role:i===0?'before':'after'}));
   return {scope:assert?'user-asserted':'temporal-underspecified',
     events,relations:predecessor&&successor?[{type:'before',from:0,to:1}]:[]};
 }
 a=s.match(/^si\s+(.+?),\s*(.+)$/u);
 if(a){
   const condition=frameOf(a[1],parseStatement),consequence=frameOf(a[2],parseStatement);
   return {scope:'conditional',
     events:[condition,consequence].filter(Boolean).map((event,i)=>({
       ...event,scope:i===0?'condition':'consequence',asserted:false
     })),
     relations:condition&&consequence?[{type:'implies-if',from:0,to:1}]:[]};
 }
 return {scope:base.scope,events:[],relations:[]};
}
