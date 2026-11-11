import {createHash,createHmac} from 'node:crypto';
// Offline consolidation is a bounded, deterministic digest of independently
// verified outcomes. It never invents memories, purges episodes or invokes LLMs.
const PERIOD_MS=6*3600*1000;
const allowed=new Set(['respond','verify','clarify','attentive','task_first']);
const tag=v=>String(v||'').replace(/[^a-z0-9_-]/gi,'').slice(0,80);
const time=v=>{const x=Date.parse(String(v||''));return Number.isFinite(x)?x:null;};
const seal=(payload,key)=>key
  ?createHmac('sha256',key).update(payload).digest('hex')
  :createHash('sha256').update(payload).digest('hex');
export function consolidationDue(state={},nowMs=Date.now()){
 const previous=time(state?.last_at);
 return previous===null||nowMs-previous>=PERIOD_MS;
}
export function consolidateRows(rows=[],{
  at=new Date().toISOString(),previous={},signingKey='',
}={}){
 if(!Number.isFinite(time(at)))throw Error('clock needed');
 const limited=(Array.isArray(rows)?rows:[]).slice(0,100);
 const counts=new Map();
 for(const row of limited){
  const context=tag(row.context_tag),action=String(row.action||'');
  if(!context||!allowed.has(action)||
    row.source!=='machine-verified'||![0,1].includes(Number(row.success)))continue;
  const key=context+'|'+action;
  const item=counts.get(key)||{context,action,successes:0,failures:0};
  if(Number(row.success)===1)item.successes++;else item.failures++;
  counts.set(key,item);
 }
 const patterns=[...counts.values()].filter(v=>v.successes+v.failures>=2)
   .sort((a,b)=>(b.successes+b.failures)-(a.successes+a.failures)||
     a.context.localeCompare(b.context)).slice(0,8);
 const data={version:'aura-memory-consolidation-v1',
  revision:Math.max(0,Number(previous?.revision)||0)+1,
  last_at:at,verified_rows:limited.filter(r=>r.source==='machine-verified').length,
  evidence:patterns,prior_digest:String(previous?.digest||'').slice(0,64),
  irreversible_deletion:false,subjective_experience_proven:false};
 const serialized=JSON.stringify(data);
 const digest=seal(serialized,signingKey);
 return {...data,digest,integrity:signingKey?'hmac-sha256-keyed':'sha256-unkeyed',
   signed:signingKey.length>=24};
}
export function verifyConsolidation(data={},signingKey=''){
 if(!data?.digest||!data?.last_at||!Array.isArray(data.evidence))return false;
 const {digest,integrity,signed,...fields}=data;
 if(signed!==Boolean(signingKey.length>=24))return false;
 return seal(JSON.stringify(fields),signingKey)===digest;
}
export class OfflineConsolidation {
 constructor({db,clock=()=>Date.now(),signingKey=''}={}){
  if(!db)throw Error('DB needed');this.db=db;this.clock=clock;
  this.signingKey=String(signingKey||'').length>=24?String(signingKey):'';
 }
 async step(previous={}){
  const nowMs=this.clock();
  if(!consolidationDue(previous,nowMs))
    return {executed:false,reason:'not-due',state:previous};
  // Query only the independent receipts. No text or inferred action success.
  let rows;
  try{
    [rows]=await this.db.execute(
      'SELECT e.context_tag,e.action,o.success,o.source FROM aura_history_episodes e '+
      'JOIN aura_history_outcomes o ON o.episode_id=e.id '+
      "WHERE e.ablated=0 AND e.kind='action' AND o.source='machine-verified' "+
      'AND o.success IS NOT NULL ORDER BY e.id DESC LIMIT 100');
  }catch{
    return {executed:false,reason:'verified-ledger-unavailable',state:previous};
  }
  const state=consolidateRows(rows,{
    at:new Date(nowMs).toISOString(),previous,signingKey:this.signingKey});
  return {executed:true,reason:'verified-offline-replay',
    state,verified_patterns:state.evidence.length,
    signed:state.signed,irreversible_deletion:false};
 }
}
