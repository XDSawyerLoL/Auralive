// Optional operator-installed learner snapshot. Read-only runtime; never trains
// on arbitrary users or remote text and never exposes the configured file path.
import {readFileSync,statSync} from 'node:fs';
import {NativeConstructionLearner} from './native_construction_learning.js';
let cached,diagnostic={configured:false,ready:false,reason:'disabled'};
export function getNativeRuntimeConstructionLearner(env=process.env){
 const configured=String(env.AURA_NATIVE_CONSTRUCTIONS_FILE||'').trim();
 if(!configured)return null;
 if(cached!==undefined)return cached;
 try{
  const size=statSync(configured).size;
  if(size<30||size>2_000_000)throw Error('size');
  const parsed=JSON.parse(readFileSync(configured,'utf8'));
  const learner=new NativeConstructionLearner(parsed);
  if(!learner.status().ready)throw Error('no-trusted-constructions');
  cached=learner;
  diagnostic={configured:true,ready:true,reason:'operator-curated-snapshot',status:learner.status()};
 }catch{
  cached=null;
  diagnostic={configured:true,ready:false,reason:'snapshot-unavailable-or-invalid'};
 }
 return cached;
}
export function nativeRuntimeConstructionStatus(){return {...diagnostic};}
