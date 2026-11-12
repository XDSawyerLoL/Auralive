// On-device model predictions are observations, NOT verified external facts.
// Only private sessions may submit them. Raw media is not accepted.
const kindSet=new Set(['visual-classification','speech-transcription']);
const sourceSet=new Set(['browser-ondevice-transformers','browser-ondevice-speechrecognition']);
const cleanString=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\x00-\x08\x0b\x0e-\x1f]/.test(v);
export function validateSemanticPerception(value,nowMs=Date.now()){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 if(Object.keys(value).some(k=>!['kind','source','measured_at','payload','model'].includes(k)))return null;
 const kind=String(value.kind||''),source=String(value.source||'');
 if(!kindSet.has(kind)||!sourceSet.has(source))return null;
 if(kind==='visual-classification'&&source!=='browser-ondevice-transformers')return null;
 if(kind==='speech-transcription'&&source!=='browser-ondevice-speechrecognition')return null;
 const t=Date.parse(String(value.measured_at||''));
 if(!Number.isFinite(t)||Math.abs(nowMs-t)>15000)return null;
 const payload=value.payload;
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return null;
 if(!cleanString(value.model,110))return null;
 if(kind==='visual-classification'){
   if(Object.keys(payload).some(k=>!['label','confidence'].includes(k)))return null;
   if(!cleanString(payload.label,90)||!/^[\p{L}\p{N},.()' /_-]{2,90}$/u.test(payload.label))return null;
   if(typeof payload.confidence!=='number'||!Number.isFinite(payload.confidence)||
      payload.confidence<0||payload.confidence>1)return null;
   return {kind,source,model:value.model,measured_at:new Date(t).toISOString(),
     payload:{label:payload.label,confidence:Math.round(payload.confidence*1000)/1000},
     evidence_scope:'unverified-client-model-output',trusted:false,
     verified_real_world:false,no_media_uploaded:true};
 }
 if(Object.keys(payload).some(k=>!['text','language','final'].includes(k)))return null;
 if(!cleanString(payload.text,300)||!payload.text.trim()||
    !cleanString(payload.language,12)||!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(payload.language)||
    payload.final!==true)return null;
 return {kind,source,model:value.model,measured_at:new Date(t).toISOString(),
   payload:{text:payload.text.trim(),language:payload.language,final:true},
   evidence_scope:'unverified-client-model-output',trusted:false,
   verified_real_world:false,no_media_uploaded:true};
}
