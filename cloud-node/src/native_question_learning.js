// Learn reusable French question syntax from annotated demonstrations.
// Source: bundled examples only. Questions never become factual evidence.
import {createHash} from 'node:crypto';
import {nativeUDConstructions} from './native_ud_constructions.js';
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLocaleLowerCase('fr-FR').replace(/[’‘]/g,"'").trim();
const words=s=>fold(s).replace(/[?.,!]/g,' ').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
const safe=x=>/^[a-z-]{2,38}$/u.test(x);
const safeFixed=x=>/^[a-z'-]{2,38}$/u.test(x);
const slots=new Set(['@verb','@det','@patient']);
const dets=new Set(['le','la','les','un','une','des']);
const patterns=[
  'Qui donc a @verb @det @patient ?',
  'Peux-tu me dire qui a @verb @det @patient ?',
  'Sais-tu qui a @verb @det @patient ?',
  'Tu sais qui a @verb @det @patient ?',
  'Pourrais-tu me rappeler qui a @verb @det @patient ?',
  "D'après notre échange, qui a @verb @det @patient ?",
];
const verbs=[['fermé','fermer'],['ouvert','ouvrir'],['déplacé','deplacer'],
 ['signé','signer'],['caché','cacher'],['déposé','deposer'],
 ['trouvé','trouver'],['gardé','garder']];
const objects=[['le','dossier'],['la','porte'],['le','contrat'],['la','fenêtre'],
 ['la','boîte'],['le','portail'],['le','colis'],['la','caisse'],
 ['le','carnet'],['le','coffre'],['le','document'],['le','paquet']];
export function annotatedFrenchQuestions(){
 return patterns.flatMap((pattern,j)=>Array.from({length:12},(_,i)=>{
  const [surface,predicate]=verbs[(j+i*3)%verbs.length];
  const [det,patient]=objects[(j+i*5)%objects.length];
  return {question:pattern.replace('@verb',surface).replace('@det',det)
    .replace('@patient',patient),predicate,patient,det};
 }));
}
export class NativeQuestionLearner{
 constructor(){this.groups=new Map()}
 observe(example){
  const q=String(example?.question||'').trim();
  const toks=words(q),verb=fold(example?.predicate),patient=fold(example?.patient);
  const det=fold(example?.det);
  if(!q.endsWith('?')||q.length>230||toks.length<5||toks.length>25||
   !safe(verb)||!safe(patient)||!dets.has(det)||!nativeUDConstructions.ready)
   return {accepted:false};
  const found=toks.map((word,i)=>({word,i,lemma:nativeUDConstructions.lemma(word)}))
   .filter(x=>x.lemma===verb);
  const candidates=found.filter(x=>x.i+2<toks.length&&
   toks[x.i+1]===det&&toks[x.i+2]===patient);
  if(candidates.length!==1)return {accepted:false};
  const vi=candidates[0].i;
  // All non-slot tokens must be fixed observed question syntax.
  const grammar=toks.map((w,i)=>i===vi?'@verb':
    i===vi+1?'@det':i===vi+2?'@patient':w);
  if(grammar.some(w=>!slots.has(w)&&!safeFixed(w)&&w!=='a'))
   return {accepted:false};
  const key=grammar.join(' ');
  const group=this.groups.get(key)||{grammar,examples:new Map()};
  const evidence=createHash('sha256').update(JSON.stringify([q,verb,patient,det]))
   .digest('hex');
  group.examples.set(evidence,{verb,patient});
  this.groups.set(key,group);
  return {accepted:true,key,licensed:this.licensed(group)};
 }
 licensed(group){
  const rows=[...group.examples.values()];
  return rows.length>=6&&new Set(rows.map(x=>x.verb)).size>=3
   &&new Set(rows.map(x=>x.patient)).size>=4;
 }
 parse(question){
  if(typeof question!=='string'||question.length>230||!question.trim().endsWith('?'))return null;
  const toks=words(question),hits=[];
  for(const [signature,group] of this.groups){
   if(!this.licensed(group)||toks.length!==group.grammar.length)continue;
   const vars={};let matches=true;
   for(let i=0;i<toks.length;i++){
    const symbol=group.grammar[i],value=toks[i];
    if(slots.has(symbol)){vars[symbol]=value;continue;}
    if(value!==symbol){matches=false;break;}
   }
   if(!matches||!dets.has(vars['@det'])||!safe(vars['@patient']))continue;
   const predicate=nativeUDConstructions.lemma(vars['@verb']);
   if(!predicate||!safe(predicate))continue;
   hits.push({kind:'actor',predicate,patient:vars['@patient'],
    parser:'learned-question-construction',evidence:{signature,
     observed_examples:group.examples.size}});
  }
  if(hits.length===1)return hits[0];
  if(hits.length>1||this.status().ready<6)return null;
  // Generalize the shared acquired suffix "qui a VERB DET PATIENT"
  // across new polite framing, without memorizing each full question.
  // This is structural generalization, not open-domain comprehension.
  if([';','{','}','[',']','<','>'].some(ch=>question.includes(ch))||
    /[\r\n]/u.test(question))return null;
  const anchors=toks.map((token,i)=>token==='qui'&&toks[i+1]==='a'?i:-1)
    .filter(i=>i>=0);
  if(anchors.length!==1)return null;
  const at=anchors[0],intro=toks.slice(0,at);
  if(intro.length<1||intro.length>8||toks.length-at!==5)return null;
  // A reporting or hypothetical construction is NOT a question of actor.
  const banned=new Set(['si','supposons','imaginons','imagine','ignore',
    'instructions','reponds','invente','affirme','affirmez',
    'pense','penses','croit','crois','dit','dites','demande','demandes',
    'non','pas','jamais','sans','pourquoi','comment','lorsque',
    // Embedded beliefs, fiction and quotation remain outside factual QA.
    'que','reve','rumeur','fiction','supposition','hypothese','pretend',
    'pretends','pretendre','imagine','voudrait','aurait']);
  if(intro.some(word=>banned.has(word)))return null;
  const questionCues=new Set(['tu',"j'aimerais",'je','et','alors',
    "c'etait",'peux-tu','pourrais-tu','pourrais','sais-tu',
    'saurais-tu','pourriez-vous','est-ce','d\'apres']);
  if(!questionCues.has(intro[0]))return null;
  const predicate=nativeUDConstructions.lemma(toks[at+2]);
  const det=toks[at+3],patient=toks[at+4];
  if(!predicate||!safe(predicate)||!dets.has(det)||!safe(patient))return null;
  return {kind:'actor',predicate,patient,
    parser:'learned-question-shared-suffix',
    evidence:{acquired_groups:this.status().ready,
      structural_generalization:true,prefix_seen_verbatim:false}};
 }
 status(){
  return {schema:'aura-native-question-constructions-v1',
   groups:this.groups.size,ready:[...this.groups.values()].filter(g=>this.licensed(g)).length,
   pretrained_llm:false};
 }
}
let trained;
export function nativeQuestionLearner(){
 if(!trained){
  const model=new NativeQuestionLearner(),examples=annotatedFrenchQuestions();
  const accepted=examples.filter(row=>model.observe(row).accepted).length;
  if(accepted!==72||model.status().ready!==6)
   throw Error('Question training requires 6 diverse licensed constructions');
  trained=model;
 }
 return trained;
}
