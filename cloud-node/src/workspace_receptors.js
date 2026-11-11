// Functionally distinct, deterministic receptors. They consume delivered
// workspace items, not unbroadcast candidate lists or raw user text.
const clamp=x=>Math.max(0,Math.min(1,Number.isFinite(Number(x))?Number(x):0));
const list=x=>Array.isArray(x)?x:[];
export const RECEPTOR_VERSION='aura-differentiated-receptors-v1';
export function consumeWorkspaceRecipients(received={},{
  mutedRecipients=[],
}={}){
 const muted=new Set(mutedRecipients);
 const signals=key=>muted.has(key)?[]:list(received[key]);
 const pre=signals('prefrontal'),ins=signals('insula');
 const memory=signals('hippocampus'),motor=signals('basal_ganglia');
 const meta=signals('metacognition');
 const verification=pre.some(s=>s.source==='metacognition')||
  pre.some(s=>s.source==='prediction_error'&&clamp(s.score)>=.7);
 const reserve=ins.some(s=>s.source==='interoception'&&
  clamp(s.metadata?.pressure)>=.75);
 const policy=motor.filter(s=>s.source==='memory'&&
  ['verified-history-changed-policy','reported-feedback-policy']
    .includes(s.label));
 const ids=memory.filter(s=>s.source==='memory'&&
   ['retrieved-note','retrieved-message'].includes(s.label))
  .map(s=>String(s.metadata?.ref||''))
  .filter(ref=>/^(?:note|message):[0-9a-f-]{1,40}$/i.test(ref));
 return {
  version:RECEPTOR_VERSION,
  prefrontal:{kind:'executive-control',consumed:pre.length,
    verification_required:verification,
    attention:pre[0]?.source||'none'},
  hippocampus:{kind:'memory-reference-selection',consumed:memory.length,
    references:[...new Set(ids)].slice(0,4)},
  insula:{kind:'resource-interoception',consumed:ins.length,
    optional_compute_deferred:reserve,
    measured_pressure:ins.reduce((max,s)=>s.source==='interoception'
      ?Math.max(max,clamp(s.metadata?.pressure)):max,0)},
  basal_ganglia:{kind:'policy-selection',consumed:motor.length,
    selected_policies:policy.map(s=>({label:s.label,
      action:String(s.metadata?.action||'respond').slice(0,35)}))},
  metacognition:{kind:'uncertainty-monitoring',consumed:meta.length,
    warnings:meta.filter(s=>s.source==='metacognition'||
      s.source==='prediction_error').map(s=>s.label).slice(0,4)},
  mute_test:{muted:[...muted]},
 };
}
export function receptorAblation(received){
 const full=consumeWorkspaceRecipients(received);
 const noInsula=consumeWorkspaceRecipients(received,{mutedRecipients:['insula']});
 const noPrefrontal=consumeWorkspaceRecipients(received,{mutedRecipients:['prefrontal']});
 const noHippocampus=consumeWorkspaceRecipients(received,{mutedRecipients:['hippocampus']});
 return {full,noInsula,noPrefrontal,noHippocampus,
  insula_causal:full.insula.optional_compute_deferred!==noInsula.insula.optional_compute_deferred,
  prefrontal_causal:full.prefrontal.verification_required!==
    noPrefrontal.prefrontal.verification_required,
  memory_causal:full.hippocampus.references.length!==
    noHippocampus.hippocampus.references.length};
}
