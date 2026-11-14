// In-memory semantic episode index, scoped to a supplied conversation.
// Reindex on each request or explicitly retire an id; no global user history,
// no automatic training, and never store embeddings on disk.
import {classifyFrenchEventScope} from './native_event_modality.js';
import {dotSimilarity} from './native_local_sentence_encoder.js';
const MAX_EPISODES=40;
const MAX_CHARS=800;
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id);
const validVector=v=>Array.isArray(v)&&v.length===384&&v.every(Number.isFinite)&&
 Math.hypot(...v)>0.0001;
export class NativeSemanticEpisodeIndex{
 constructor(encoder,{minSimilarity=0.76,margin=0.07}={}){
  this.encoder=encoder;
  this.rows=new Map();
  this.minSimilarity=minSimilarity;
  this.margin=margin;
 }
 async add({id,text,role,evidence_scope}={}){
  if(!validId(id)||typeof text!=='string'||text.length<5||
     text.length>MAX_CHARS||role!=='user'||
     evidence_scope!=='user-statement-unverified'||
     classifyFrenchEventScope(text).scope!=='user-asserted')
    return {accepted:false,reason:'inadmissible-passage'};
  if(!this.encoder||typeof this.encoder.embed!=='function')
    return {accepted:false,reason:'encoder-unavailable'};
  let vector=null;
  try{vector=await this.encoder.embed(text);}catch{}
  if(!validVector(vector))return {accepted:false,reason:'embedding-unavailable'};
  // An explicit id identifies one message; replacement is atomic and leaves
  // no stale old vector. External correction must provide that message id.
  this.rows.delete(id);
  this.rows.set(id,{id,text,vector});
  while(this.rows.size>MAX_EPISODES)this.rows.delete(this.rows.keys().next().value);
  return {accepted:true,id,count:this.rows.size};
 }
 remove(id){return validId(id)&&this.rows.delete(id);}
 clear(){this.rows.clear();}
 status(){return {schema:'aura-local-semantic-episodes-v1',
  count:this.rows.size,max_episodes:MAX_EPISODES,persistent:false,
  externally_verified_facts:0,can_answer_facts:false};}
 async retrieve(question,{minimum=this.minSimilarity,margin=this.margin}={}){
  if(typeof question!=='string'||question.length<5||question.length>500||
     this.rows.size===0)return {status:'no-context',matches:[]};
  let target;
  try{target=await this.encoder.embed(question);}catch{}
  if(!validVector(target))return {status:'encoder-unavailable',matches:[]};
  const scores=[];
  for(const row of this.rows.values()){
   const cosine=dotSimilarity(target,row.vector);
   if(cosine===null)continue;
   scores.push({id:row.id,cosine,text:row.text});
  }
  scores.sort((a,b)=>b.cosine-a.cosine||a.id.localeCompare(b.id));
  const top=scores[0],runner=scores[1];
  if(!top||top.cosine<minimum)return {status:'no-confident-match',matches:[]};
  if(runner&&top.cosine-runner.cosine<margin)
   return {status:'ambiguous',matches:[],competing_passages:2};
  return {status:'retrieved-unverified-passage',matches:[{
    id:top.id,score:Number(top.cosine.toFixed(6)),
    text:top.text,evidence_scope:'user-statement-unverified'
   }],can_answer_facts:false,verified_world_facts:0};
 }
}
export async function retrieveLocalConversationMemory(question,history,encoder,options={}){
 if(!Array.isArray(history)||history.length>200)
  return {status:'invalid-history',matches:[]};
 const index=new NativeSemanticEpisodeIndex(encoder,options);
 const recent=history.slice(-MAX_EPISODES);
 for(let i=0;i<recent.length;i++){
  const row=recent[i];
  if(row?.role!=='user'||typeof row.content!=='string')continue;
  // A correction references the prior message by an explicit stable turn id;
  // never guess which memory was contradicted based on vector similarity.
  if(validId(row.retracts_message_id))index.remove(row.retracts_message_id);
  await index.add({id:'turn-'+String(history.length-recent.length+i),
   text:row.content,role:'user',evidence_scope:'user-statement-unverified'});
 }
 return index.retrieve(question);
}
