// AURA learns bundled, supervised French constructions at first local use.
// Operator-installed snapshots remain separate and read-only.
import {readFileSync,statSync} from 'node:fs';
import {NativeConstructionLearner} from './native_construction_learning.js';
import {trainNativeDialogueConstructions} from './native_builtin_dialogue_training.js';
let cachedPath=null,cached=null,diagnostic={configured:false,ready:false,reason:'disabled'};
export function getNativeRuntimeConstructionLearner(env=process.env){
 if(env.AURA_NATIVE_CONSTRUCTIONS_ENABLED==='false')return null;
 const configured=String(env.AURA_NATIVE_CONSTRUCTIONS_FILE||'').trim();
 const cacheKey=configured||'__bundled_supervised_training__';
 if(cachedPath===cacheKey)return cached;
 try{
  let learner,audit;
  if(!configured){
   ({learner,audit}=trainNativeDialogueConstructions());
  }else{
   const size=statSync(configured).size;
   if(size<30||size>2_000_000)throw Error('size');
   learner=new NativeConstructionLearner(JSON.parse(readFileSync(configured,'utf8')));
  }
  if(!learner.status().ready)throw Error('no-learned-constructions');
  cached=learner;
  diagnostic={configured:true,ready:true,
   reason:configured?'operator-curated-snapshot':'bundled-supervised-acquisition',
   pretrained_llm:false,external_inference:false,
   ...(audit?{audit}:{}),status:learner.status()};
 }catch{
  cached=null;
  diagnostic={configured:true,ready:false,reason:'native-training-or-snapshot-invalid'};
 }
 cachedPath=cacheKey;
 return cached;
}
export function nativeRuntimeConstructionStatus(){return {...diagnostic};}
