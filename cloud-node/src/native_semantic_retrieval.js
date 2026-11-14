// Semantic retrieval is limited to quoted, already-grounded user passages.
// It cannot infer who did what, nor convert a conditional to a fact.
// A strong cosine score without an independent margin is NOT sufficient.
import {classifyFrenchEventScope} from './native_event_modality.js';
import {dotSimilarity} from './native_local_sentence_encoder.js';
export async function retrieveNativeSemanticEvidence({
  query='',passages=[],encoder,minimum=0.76,margin=0.07
}={}){
 if(typeof query!=='string'||query.length<5||query.length>500||
    !Array.isArray(passages)||passages.length<1||passages.length>30||
    !encoder||typeof encoder.embed!=='function')return {status:'unavailable',matches:[]};
 const question=await encoder.embed(query);
 if(!question)return {status:'encoder-unavailable',matches:[]};
 const scored=[];
 for(let i=0;i<passages.length;i++){
  const record=passages[i];
  const text=record?.text;
  if(typeof text!=='string'||text.length<5||text.length>800||
    record?.role!=='user'||record?.evidence_scope!=='user-statement-unverified')
    continue;
  if(classifyFrenchEventScope(text).scope!=='user-asserted')continue;
  const vector=await encoder.embed(text);
  const score=dotSimilarity(question,vector);
  if(score===null)continue;
  scored.push({index:i,score:Number(score.toFixed(6)),
    text,evidence_scope:'user-statement-unverified'});
 }
 scored.sort((a,b)=>b.score-a.score);
 const first=scored[0],second=scored[1];
 if(!first||first.score<minimum)return {status:'no-confident-match',matches:[]};
 if(second&&first.score-second.score<margin)
   return {status:'ambiguous',matches:[]};
 return {status:'retrieved-unverified-passage',matches:[first],
   disclaimer:'Semantic retrieval only; no event truth or role inference'};
}
