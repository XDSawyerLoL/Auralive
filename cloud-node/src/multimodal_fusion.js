// Cross-modal association is temporal coincidence, not proof that spoken
// words refer to a detected object. It never reads or preserves a transcript.
const time=x=>{const v=Date.parse(String(x||''));return Number.isFinite(v)?v:null;};
export function fusePerceptualEvents(previous={},event=null,{windowMs=15000}={}){
 const state={speech_at:previous?.speech_at||null,vision_at:previous?.vision_at||null,
   vision_kind:previous?.vision_kind||null,last_pair_key:previous?.last_pair_key||null};
 if(!event||!['speech-detected','object-hypothesis-stable','object-image-displacement-hypothesis','visual-hypothesis-changed']
  .includes(event.kind)||event.verified_real_world!==false)return {state,event:null};
 const at=time(event.at);
 if(at===null)return {state,event:null};
 if(event.kind==='speech-detected'){
   const prior=time(state.speech_at);
   if(prior!==null&&at<=prior)return {state,event:null};
   state.speech_at=event.at;
 }else{
   const prior=time(state.vision_at);
   if(prior!==null&&at<=prior)return {state,event:null};
   state.vision_at=event.at;state.vision_kind=event.kind;
 }
 const speech=time(state.speech_at),vision=time(state.vision_at);
 if(speech===null||vision===null||Math.abs(speech-vision)>Math.max(1000,windowMs))
   return {state,event:null};
 const key=state.speech_at+':'+state.vision_at;
 if(key===state.last_pair_key)return {state,event:null};
 state.last_pair_key=key;
 return {state,event:{
   kind:'audio-visual-temporal-coincidence',
   at:new Date(Math.max(speech,vision)).toISOString(),
   label:'browser-multimodal-hypothesis',
   evidence_scope:'temporal-coincidence-only',
   verified_real_world:false,confidence_claim:false,
   interpretation:state.vision_kind==='object-image-displacement-hypothesis'
    ?'speech-near-image-space-displacement-no-causal-attribution'
    :'speech-and-visual-output-near-in-time-not-causal-relation',
   image_displacement_hypothesis:state.vision_kind==='object-image-displacement-hypothesis',
   person_moved_object_verified:false,
 }};
}
export function decidePerceptualIntervention(fusion,context={}){
 if(!fusion||fusion.kind!=='audio-visual-temporal-coincidence'||
   fusion.verified_real_world!==false)return {act:'silence',reason:'no-valid-fusion'};
 if(context.resource_pressure>=.7||context.conversation_busy===true)
   return {act:'defer',reason:'resource-or-conversation-busy'};
 // No intervention on unverified sensor data. Attention may observe it.
 return {act:'observe',reason:'unverified-temporal-association',
   outbound_action:false,question_issued:false};
}
