// Voluntary browser-derived sensory features. No raw camera frames,
// recordings, transcripts or personally identifying content are accepted.
// Readings are client-reported and therefore NEVER machine-verified facts.
const allowed=new Set(['visual-luminance-motion','audio-level']);
const clamp=x=>Math.max(0,Math.min(1,Number(x)));
export function validateSensoryReading(input={},nowMs=Date.now()){
  if(!input||typeof input!=='object'||Array.isArray(input))return null;
  const kind=String(input.kind||'');
  if(!allowed.has(kind))return null;
  const source=String(input.source||'');
  if(source!=='browser-opt-in-local-measurement')return null;
  const measured=Date.parse(String(input.measured_at||''));
  if(!Number.isFinite(measured)||Math.abs(nowMs-measured)>15000)return null;
  const values=kind==='visual-luminance-motion'
    ?['luminance','motion']:['level'];
  if(Object.keys(input).some(x=>!['kind','source','measured_at','features'].includes(x)))
    return null;
  const features=input.features;
  if(!features||typeof features!=='object'||Array.isArray(features)||
    Object.keys(features).length!==values.length||
    Object.keys(features).some(x=>!values.includes(x)))return null;
  const normalized={};
  for(const key of values){
    if(typeof features[key]!=='number'||!Number.isFinite(features[key])||
      features[key]<0||features[key]>1)return null;
    normalized[key]=Math.round(clamp(features[key])*1000)/1000;
  }
  return {kind,source,measured_at:new Date(measured).toISOString(),
    features:normalized,evidence_scope:'client-reported-sensor-feature',
    identity_or_object_recognition:false,speech_recognition:false,
    independently_verified:false};
}
