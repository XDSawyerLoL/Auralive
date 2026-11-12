// On-device model predictions are observations, NOT verified external facts.
// Only private sessions may submit them. Raw media is not accepted.
const kindSet=new Set(['visual-classification','visual-objects','speech-transcription']);
const sourceSet=new Set(['browser-ondevice-transformers','browser-ondevice-speechrecognition']);
const cleanString=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\x00-\x08\x0b\x0e-\x1f]/.test(v);
export function validateSemanticPerception(value,nowMs=Date.now()){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 if(Object.keys(value).some(k=>!['kind','source','measured_at','payload','model'].includes(k)))return null;
 const kind=String(value.kind||''),source=String(value.source||'');
 if(!kindSet.has(kind)||!sourceSet.has(source))return null;
 if((kind==='visual-classification'||kind==='visual-objects')&&source!=='browser-ondevice-transformers')return null;
 if(kind==='speech-transcription'&&source!=='browser-ondevice-speechrecognition')return null;
 const t=Date.parse(String(value.measured_at||''));
 if(!Number.isFinite(t)||Math.abs(nowMs-t)>15000)return null;
 const payload=value.payload;
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return null;
 if(!cleanString(value.model,110))return null;
 if(kind==='visual-objects'){
   if(Object.keys(payload).some(k=>!['objects'].includes(k))||
      !Array.isArray(payload.objects)||payload.objects.length>8)return null;
   const objects=[];
   for(const item of payload.objects){
     if(!item||typeof item!=='object'||Array.isArray(item)||
        Object.keys(item).some(k=>!['label','confidence','box'].includes(k))||
        !cleanString(item.label,70)||
        !/^[\p{L}\p{N},.()' /_-]{2,70}$/u.test(item.label)||
        typeof item.confidence!=='number'||!Number.isFinite(item.confidence)||
        item.confidence<0||item.confidence>1||
        !item.box||typeof item.box!=='object'||Array.isArray(item.box)||
        Object.keys(item.box).length!==4||
        Object.keys(item.box).some(k=>!['xmin','ymin','xmax','ymax'].includes(k))||
        !['xmin','ymin','xmax','ymax'].every(k=>typeof item.box[k]==='number'&&
          Number.isFinite(item.box[k])&&item.box[k]>=0&&item.box[k]<=1)||
        item.box.xmin>=item.box.xmax||item.box.ymin>=item.box.ymax)return null;
     objects.push({label:item.label,confidence:Math.round(item.confidence*1000)/1000,
       box:Object.fromEntries(['xmin','ymin','xmax','ymax'].map(k=>[k,Math.round(item.box[k]*1000)/1000]))});
   }
   return {kind,source,model:value.model,measured_at:new Date(t).toISOString(),
     payload:{objects},evidence_scope:'unverified-client-object-detection',
     trusted:false,verified_real_world:false,no_media_uploaded:true};
 }
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
