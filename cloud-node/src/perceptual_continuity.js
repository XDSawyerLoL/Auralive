// Temporal grouping of CLIENT MODEL OUTPUT. This is not independent
// verification of a scene: repeated agreement can itself repeat model error.
// Transcripts are not kept here: only their occurrence and coarse length.
const asMs=s=>{const n=Date.parse(String(s||''));return Number.isFinite(n)?n:null;};
const round=x=>Math.round(x*1000)/1000;
const empty=()=>({revision:0,visual:null,last_speech_at:null,last_event:null});
export function updatePerceptualContinuity(previous=null,reading=null,{
  maxGapMs=90000,minimumVisualAgreement=2,
}={}){
 const state=previous&&typeof previous==='object'?previous:empty();
 if(!reading||reading.trusted!==false||reading.verified_real_world!==false)
  return {state,event:null,accepted:false};
 const at=asMs(reading.measured_at);
 if(at===null)return {state,event:null,accepted:false};
 if(reading.kind==='speech-transcription'){
  const last=asMs(state.last_speech_at);
  if(last!==null&&at<=last)return {state,event:null,accepted:false};
  const wordCount=String(reading.payload?.text||'').trim().split(/\s+/u).filter(Boolean).length;
  const event={kind:'speech-detected',at:new Date(at).toISOString(),
    speech_length_band:wordCount<=3?'short':wordCount<=18?'medium':'long',
    label:'browser-speech-hypothesis',verified_real_world:false,
    claim:'client-model-output-not-user-command'};
  return {accepted:true,event,state:{...state,revision:(Number(state.revision)||0)+1,
    last_speech_at:event.at,last_event:event}};
 }
 if(reading.kind!=='visual-classification')return {state,event:null,accepted:false};
 const label=String(reading.payload?.label||'').toLowerCase().trim();
 const confidence=Number(reading.payload?.confidence);
 if(!label||!Number.isFinite(confidence)||confidence<.35)
  return {state,event:null,accepted:false};
 const old=state.visual;
 const oldAt=asMs(old?.at);
 if(oldAt!==null&&at<=oldAt)return {state,event:null,accepted:false};
 const within=oldAt!==null&&at-oldAt<=Math.max(1000,maxGapMs);
 const matching=within&&old.label===label;
 const count=matching?Math.min(50,Math.max(1,Number(old.count)||1)+1):1;
 const visual={label,at:new Date(at).toISOString(),count,confidence:round(confidence)};
 let event=null;
 const threshold=Math.max(2,Math.min(5,Math.floor(minimumVisualAgreement)));
 if(count===threshold){
  // A new stable classification, not an assertion that the object exists.
  event={kind:old?.confirmed_label===label?'visual-hypothesis-repeated':
    'visual-hypothesis-changed',at:visual.at,
    label:'browser-visual-hypothesis',model_label:label,
    confidence:visual.confidence,agreement_count:count,
    verified_real_world:false,claim:'repeated-client-model-output'};
 }
 const confirmedLabel=event?label:(within?old?.confirmed_label||null:null);
 const next={...state,revision:(Number(state.revision)||0)+1,
  visual:{...visual,confirmed_label:confirmedLabel},last_event:event||state.last_event||null};
 return {state:next,event,accepted:true};
}
export const emptyPerceptualContinuity=empty;
