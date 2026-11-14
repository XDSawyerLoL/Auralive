// Open-vocabulary conceptual graph with typed, versioned provenance.
// This stores assertions ABOUT the world, not verified world facts.
// Concepts and relations are learned from observations, not a fixed ontology.
import {createHash} from 'node:crypto';
export const CONCEPT_MEMORY_SCHEMA='aura-concept-memory-v1';
const MAX_NODES=480,MAX_LINKS=360,MAX_REVISIONS=600;
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,24);
const fold=s=>String(s||'').normalize('NFC').trim().replace(/\s+/gu,' ')
 .toLocaleLowerCase('fr-FR');
const slug=s=>String(s||'').trim().toLowerCase().replace(/[^a-z0-9_-]/g,'_');
const time=s=>typeof s==='string'&&s.endsWith('Z')&&Number.isFinite(Date.parse(s));
const safeReference=s=>/^[a-zA-Z0-9_:-]{3,128}$/.test(String(s||''));
const clean=(text,max)=>typeof text==='string'&&text.trim().length>=2&&
 text.length<=max&&!/[\u0000-\u001f<>]/u.test(text);
const safeType=t=>/^[a-z][a-z0-9_-]{1,55}$/.test(String(t||''));
const sourceKinds=new Set(['user-report','model-hypothesis','machine-verified']);
const INTERNAL_MACHINE_CAPABILITY=Symbol('ledger-confirmed-concept');
const functional=new Set(['located_in','has_state','current_owner','current_location']);
const trimState=s=>{
 if(!s||s.schema!==CONCEPT_MEMORY_SCHEMA||!Array.isArray(s.nodes)||
   !Array.isArray(s.links)||!Array.isArray(s.revisions)||
   s.nodes.length>MAX_NODES||s.links.length>MAX_LINKS||
   s.revisions.length>MAX_REVISIONS||s.revision<0)
  return initialConceptMemory();
 return s;
};
export function initialConceptMemory(){
 return {schema:CONCEPT_MEMORY_SCHEMA,revision:0,nodes:[],links:[],
  revisions:[],last_modified_at:null};
}
const node=(label,kind)=>({id:hash(kind+'|'+fold(label)),
 kind,label:String(label).trim()});
const active=e=>e.active===true;
const evidenceStatus=link=>{
 const sources=link.evidence.filter(active);
 if(!sources.length)return 'retracted';
 return sources.some(x=>x.kind==='machine-verified')?'machine-observed':
  sources.some(x=>x.kind==='user-report')?'user-reported':'hypothesis';
};
function contradictionKeys(link){
 return {polarity:link.polarity==='positive'?'negative':'positive',
  functional:functional.has(link.relation)};
}
export function conceptualConflicts(state,link){
 const s=trimState(state),contradictions=contradictionKeys(link);
 return s.links.filter(other=>other.id!==link.id&&
  other.domain===link.domain&&other.subject_id===link.subject_id&&
  other.relation===link.relation&&other.time_scope===link.time_scope&&
  evidenceStatus(other)!=='retracted'&&(
   (other.object_id===link.object_id&&other.polarity===contradictions.polarity)||
   (contradictions.functional&&other.polarity==='positive'&&
    link.polarity==='positive'&&other.object_id!==link.object_id)
  )).map(e=>e.id);
}
export function addConceptRelation(state,{
 domain,subject,relation,object,polarity='positive',timeScope='unspecified',
 evidence,
}={}){
 const s=trimState(state);
 const subjectLabel=subject?.label,subjectKind=slug(subject?.kind);
 const objectLabel=object?.label,objectKind=slug(object?.kind);
 const predicate=slug(relation),scope=slug(domain);
 if(!clean(subjectLabel,160)||!clean(objectLabel,160)||
  !safeType(subjectKind)||!safeType(objectKind)||!safeType(predicate)||
  !safeType(scope)||!['positive','negative'].includes(polarity)||
  !safeReference(evidence?.source_id)||!sourceKinds.has(evidence?.kind)||
  !time(evidence?.observed_at)||!clean(timeScope,140)||
  (evidence?.kind==='machine-verified'&&evidence?.internal_capability!==INTERNAL_MACHINE_CAPABILITY))
  return {accepted:false,reason:'invalid-or-unverified-relation',state:s};
 // This input gate is also used for owner annotations: self-reported facts are
 // not allowed to request machine-verified status.
 if(evidence.kind==='machine-verified'&&(
    !Number.isSafeInteger(evidence.episode_id)||evidence.episode_id<=0||
    !/^[a-f0-9]{64}$/.test(String(evidence.proof_hash||''))))
   return {accepted:false,reason:'uncorrelated-machine-evidence',state:s};
 const source=node(subjectLabel,subjectKind),target=node(objectLabel,objectKind);
 const id=hash([scope,source.id,predicate,target.id,polarity,fold(timeScope)].join('|'));
 let nodes=s.nodes,links=s.links;
 const existing=links.find(x=>x.id===id);
 if(existing?.evidence.some(e=>e.source_id===evidence.source_id))
  return {accepted:false,reason:'repeated-evidence-id',state:s};
 if(!existing&&links.length>=MAX_LINKS)return {accepted:false,
  reason:'bounded-memory-capacity-reached',state:s};
 const newNodes=[source,target].filter(n=>!nodes.some(x=>x.id===n.id));
 if(nodes.length+newNodes.length>MAX_NODES)return {accepted:false,
  reason:'bounded-memory-capacity-reached',state:s};
 nodes=[...nodes,...newNodes];
 const record={
  source_id:evidence.source_id,kind:evidence.kind,
  observed_at:evidence.observed_at,active:true,
  episode_id:evidence.kind==='machine-verified'?evidence.episode_id:null,
  proof_hash:evidence.kind==='machine-verified'?evidence.proof_hash:null,
 };
 if(existing){
  // Repeated independent evidence is bounded: never silently evict old proof.
  if(existing.evidence.length>=16)return {accepted:false,reason:'evidence-limit',state:s};
  links=links.map(x=>x.id===id?{...x,evidence:[...x.evidence,record],
    revision:s.revision+1}:x);
 }else{
  links=[...links,{id,domain:scope,subject_id:source.id,object_id:target.id,
   relation:predicate,polarity,time_scope:fold(timeScope),
   evidence:[record],revision:s.revision+1}];
 }
 const log={revision:s.revision+1,operation:'observe',link_id:id,
  source_id:evidence.source_id,at:evidence.observed_at};
 const next={...s,nodes,links,revision:s.revision+1,
  revisions:[...s.revisions,log].slice(-MAX_REVISIONS),
  last_modified_at:evidence.observed_at};
 const link=links.find(x=>x.id===id);
 return {accepted:true,relation_id:id,status:evidenceStatus(link),
  conflicts:conceptualConflicts(next,link),state:next};
}
// The only machine-verified ingestion path cross-checks a receipt already
// accepted by the causal model. Never expose this function as an HTTP route.
export function observeMachineVerifiedConcept(state,{
 world,episodeId,runId,proofHash,context,success,observedAt
}={}){
 const verified=world?.episodes?.find(e=>
  e.episode_id===episodeId&&e.run_id===runId&&
  e.proof_hash===proofHash&&e.context===context&&
  e.success===(success?1:0)&&e.observed_at===observedAt);
 if(!verified||!Number.isSafeInteger(episodeId))
  return {accepted:false,reason:'no-verified-world-episode',state:trimState(state)};
 return addConceptRelation(state,{
  domain:context,
  subject:{label:'contexte '+context,kind:'task_context'},
  relation:'observed_result',
  object:{label:success?'réussite vérifiée':'échec vérifié',kind:'outcome'},
  timeScope:'execution',
  evidence:{
   source_id:'machine:'+String(episodeId),
   kind:'machine-verified',episode_id:episodeId,proof_hash:proofHash,
   observed_at:observedAt,internal_capability:INTERNAL_MACHINE_CAPABILITY
  }
 });
}

export function retractConceptSource(state,{sourceId,at}={}){
 const s=trimState(state);
 if(!safeReference(sourceId)||!time(at))return {changed:false,state:s};
 let changed=0;
 const links=s.links.map(l=>{
  let touched=false;
  const evidence=l.evidence.map(e=>{
   // Machine-confirmed receipts can only be invalidated by HistoryLedger
   // ablation, never a user-report retraction endpoint.
   if(e.source_id!==sourceId||!e.active||e.kind==='machine-verified')return e;
   touched=true;changed++;return {...e,active:false,retracted_at:at};
  });
  return touched?{...l,evidence,revision:s.revision+1}:l;
 });
 if(!changed)return {changed:false,state:s};
 return {changed:true,affected_evidence:changed,
  state:{...s,links,revision:s.revision+1,
   revisions:[...s.revisions,{revision:s.revision+1,operation:'retract',
    source_id:sourceId,at}].slice(-MAX_REVISIONS),last_modified_at:at}};
}
export function inspectConceptMemory(state,{domain='',limit=30}={}){
 const s=trimState(state),scope=slug(domain),n=Math.max(1,Math.min(50,Number(limit)||30));
 const records=s.links.filter(x=>!scope||x.domain===scope).slice(-n).map(x=>{
  const subject=s.nodes.find(node=>node.id===x.subject_id);
  const object=s.nodes.find(node=>node.id===x.object_id);
  return {id:x.id,domain:x.domain,subject,object,relation:x.relation,
   polarity:x.polarity,time_scope:x.time_scope,status:evidenceStatus(x),
   active_sources:x.evidence.filter(active).map(e=>({id:e.source_id,kind:e.kind})),
   conflicting_link_ids:conceptualConflicts(s,x),revision:x.revision};
 });
 return {schema:s.schema,revision:s.revision,concepts:s.nodes.length,
  relations:s.links.length,visible:records,
  verified_world_facts:records.filter(x=>x.status==='machine-observed').length,
  caveat:'User claims, hypothetical relations, and transfers are NOT verified facts'};
}
// A demonstrated relational motif can be proposed in a new domain only when
// independently observed at least twice across at least two SOURCE domains.
// This learns abstract typed relations, never asserts them as target truths.
export function proposeCrossDomainRelation(state,{
 targetDomain,subject,object,minimumSources=2,
 excludeSourceIds=[],
}={}){
 const s=trimState(state),domain=slug(targetDomain),sk=slug(subject?.kind),
  ok=slug(object?.kind);
 if(!safeType(domain)||!safeType(sk)||!safeType(ok)||!clean(subject?.label,160)||
  !clean(object?.label,160))return {transferred:false,reason:'invalid-target'};
 const excluded=new Set(excludeSourceIds);
 const candidates=new Map();
 for(const l of s.links){
  if(l.domain===domain)continue;
  const src=s.nodes.find(n=>n.id===l.subject_id);
  const dst=s.nodes.find(n=>n.id===l.object_id);
  if(src?.kind!==sk||dst?.kind!==ok)continue;
  const key=l.relation;
  const g=candidates.get(key)||{relation:key,positive:[],negative:[]};
  const bucket=l.polarity==='positive'?g.positive:g.negative;
  for(const e of l.evidence.filter(x=>x.active&&!excluded.has(x.source_id))){
   bucket.push({domain:l.domain,source_id:e.source_id,subject_id:l.subject_id,
    object_id:l.object_id,kind:e.kind});
  }
  candidates.set(key,g);
 }
 const eligible=[...candidates.values()].map(c=>{
  const independence=new Set(c.positive.map(x=>x.source_id));
  const domains=new Set(c.positive.map(x=>x.domain));
  const differentSubjects=new Set(c.positive.map(x=>x.subject_id));
  const evidence=c.positive.filter(x=>x.kind==='machine-verified').length;
  return {...c,independence:independence.size,domains:[...domains].sort(),
    distinct_subjects:differentSubjects.size,machine_receipts:evidence};
 }).filter(c=>c.independence>=minimumSources&&c.domains.length>=2&&
   c.distinct_subjects>=2&&c.negative.length===0)
  .sort((a,b)=>b.independence-a.independence||a.relation.localeCompare(b.relation));
 if(!eligible.length)return {transferred:false,
  reason:'no-diverse-uncontradicted-source-pattern',target_domain:domain};
 const top=eligible[0];
 if(eligible.length>1&&eligible[1].independence===top.independence)
  return {transferred:false,reason:'ambiguous-relational-pattern',target_domain:domain};
 return {transferred:true,status:'testable-hypothesis',verified_target_facts:0,
  relation:top.relation,subject:{...subject,kind:sk},
  object:{...object,kind:ok},target_domain:domain,
  independent_sources:top.independence,source_domains:top.domains,
  machine_verified_source_receipts:top.machine_receipts,
  source_ids:[...new Set(top.positive.map(e=>e.source_id))],
  next_action:'seek-independent-observation-not-execute'};
}
export function conceptTransferAblation(state,options){
 const actual=proposeCrossDomainRelation(state,options);
 const removed=proposeCrossDomainRelation(state,{
  ...options,excludeSourceIds:actual.source_ids||[]});
 return {actual,without_sources:removed,
  transfer_depends_on_evidence:Boolean(actual.transferred&&!removed.transferred)};
}
