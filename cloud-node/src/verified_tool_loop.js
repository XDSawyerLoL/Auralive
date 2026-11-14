import {createHash,randomUUID} from 'node:crypto';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,sep} from 'node:path';

// Deterministic, read-only canary: a real local file probe, verified through
// filesystem syscalls, without LLM, shell, network, or paid quota. Never
// turns a reported outcome into independently verified machine evidence.
const sha=data=>createHash('sha256').update(data).digest('hex');
const ACTIONS=Object.freeze(['attempt','verify-before-attempt']);
export const VERIFIED_LOOP_VERSION='aura-verified-probe-v1';
export function initialVerifiedLoop(){
 return {version:VERIFIED_LOOP_VERSION,revision:0,episodes:[],
   policies:{},last_hash:'GENESIS',last_at:null};
}
export function candidatePolicy(state={},context,excluded=[]){
 const rows=(state.episodes||[]).filter(e=>e.context===context&&
   e.verification==='fs-syscall'&&e.outcome==='failed'&&
   !excluded.includes(e.id));
 const runs=new Set(rows.map(e=>e.run_id));
 return {strategy:rows.length>=3&&runs.size>=3
     ?'verify-before-attempt':'attempt',
   failures:rows.length,independent_runs:runs.size,
   evidence_ids:rows.map(e=>e.id),source:'verified-local-outcomes'};
}
export function verifiedLoopDecision(state={},context,excluded=[]){
 const policy=candidatePolicy(state,context,excluded);
 return {context,strategy:policy.strategy,
   verifies_first:policy.strategy==='verify-before-attempt',
   evidence_ids:policy.evidence_ids,revision:Number(state.revision)||0};
}
export function verifiedLoopAblation(state,context){
 const actual=verifiedLoopDecision(state,context);
 const removed=verifiedLoopDecision(state,context,actual.evidence_ids);
 return {actual,ablated:removed,absolute_effect:actual.verifies_first!==removed.verifies_first?1:0,
   effect_size:actual.verifies_first!==removed.verifies_first?1:0,
   noise_floor:0,draws:1,deterministic:true};
}
function allowedPath(relativePath){
 const path=String(relativePath||'').replaceAll('\\','/');
 return path.length<=180&&
   /^(?:docs\/[A-Za-z0-9_\-/]+\.md|STABLE\.json|DEPLOYMENT\.json)$/.test(path)&&
   !path.split('/').includes('..')&&
   !path.includes('//') ? path:null;
}
export async function probeReadable({root,relativePath}={}){
 const safe=allowedPath(relativePath);
 if(!safe)return {code:2,reason:'path-not-allowlisted',verified:true};
 const local=resolve(root,safe),within=relative(resolve(root),local);
 if(within.startsWith('..'+sep)||within==='..'||within.startsWith(sep))
   return {code:2,reason:'path-outside-root',verified:true};
 try{
   const st=await lstat(local);
   if(!st.isFile())return {code:1,reason:'not-regular-file',verified:true};
   const truePath=await realpath(local);
   const inside=relative(resolve(root),truePath);
   if(inside.startsWith('..'+sep)||inside==='..'||inside.startsWith(sep))
     return {code:2,reason:'symlink-escape',verified:true};
   const bytes=await readFile(local);
   return {code:0,reason:'readable',verified:true,
     bytes:bytes.length,content_sha256:sha(bytes)};
 }catch(error){
   const code=String(error?.code||'');
   return {code:code==='ENOENT'||code==='EACCES'?1:2,
     reason:['ENOENT','EACCES'].includes(code)?'unreadable-or-missing':'filesystem-error',
     verified:true};
 }
}
export async function runVerifiedProbe(state={},{
  root,context='read-only-file-probe',relativePath,
  runId=randomUUID(),at=new Date().toISOString(),forcePreflight=false,
}={}){
 const before={...initialVerifiedLoop(),...(state||{})};
 const baseline=verifiedLoopDecision(before,context);
 // A learned model may ADD a preflight, never remove one or bypass the
 // owner's existing tool permission. Tool safety is strictly monotonic.
 const decision=forcePreflight&&!baseline.verifies_first
  ?{...baseline,verifies_first:true,strategy:'verify-before-attempt',
    evidence_source:'prospective-world-model'}:baseline;
 // Preflight changes the causal action order; a missing file is never
 // executed blindly after enough independent observed failures.
 const preflight=decision.verifies_first?await probeReadable({root,relativePath}):null;
 const execution=preflight&&preflight.code!==0
   ?{code:preflight.code,reason:'preflight-blocked',verified:true}
   :await probeReadable({root,relativePath});
 const outcome=execution.code===0?'succeeded':'failed';
 const entry={id:randomUUID(),run_id:runId,context,
   relative_path_sha256:sha(String(relativePath||'')),
   prediction:Number(((before.episodes.filter(e=>e.context===context&&
     e.outcome==='succeeded').length+1)/
     (before.episodes.filter(e=>e.context===context).length+2)).toFixed(4)),
   prediction_fixed_before_action:true,
   strategy:decision.strategy,preflight_code:preflight?.code??null,
   exit_code:execution.code,outcome,
   verification:'fs-syscall',observed_at:at,
   prev_hash:before.last_hash};
 entry.hash=sha(JSON.stringify(entry));
 const next={...before,version:VERIFIED_LOOP_VERSION,
   revision:before.revision+1,
   last_hash:entry.hash,last_at:at,
   episodes:[...before.episodes,entry].slice(-120),
   policies:{...before.policies,[context]:candidatePolicy({
     episodes:[...before.episodes,entry]},context)},
 };
 return {state:next,decision,verified:true,receipt:entry,
   execution:{...execution,content_sha256:execution.content_sha256||null},
   action_was_preflighted:Boolean(preflight)};
}
export function replayVerifiedLoop(state={},context){
 const rows=(state.episodes||[]);
 let prior=rows[0]?.prev_hash||'GENESIS';
 for(const row of rows){
   const {hash,...fields}=row;
   if(row.prev_hash!==prior||sha(JSON.stringify(fields))!==hash)
     return {verified:false,reason:'broken-chain',episode_id:row.id};
   prior=hash;
 }
 return {verified:true,reason:'verified-hash-chain',rows:rows.length,
   decision:verifiedLoopDecision(state,context),head:prior};
}
