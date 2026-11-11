// Central admission depends on a previous nucleus broadcast, never a fresh
// executive candidate invented by the caller. All automatic side-effecting
// actors must present the same bounded source-specific decision receipt.
const ACTORS=Object.freeze(['command-center','curiosity','evolution','capability-scout','routine']);
export const ACTION_GATE_VERSION='aura-central-action-gate-v1';
export function nextAutonomousAllowance(workspace,previous={},nowMs=Date.now(),{
  actors=ACTORS,
}={}){
  const executive=workspace?.broadcast_enabled===true &&
    Array.isArray(workspace.selected)&&workspace.selected.some(s=>s.source==='executive');
  const current=Number(previous?.sequence)||0;
  const source=executive&&actors.length?actors[current%actors.length]:null;
  return {version:ACTION_GATE_VERSION,source,
    sequence:current+1,issued_at:new Date(nowMs).toISOString(),
    expires_at:new Date(nowMs+120000).toISOString(),
    workspace_revision:Number(previous?.workspace_revision||0)+1,
    issued_by:'CognitiveKernel.tick',no_action_permission_without_broadcast:true};
}
export function centralActionAdmission({
  source,scope='autonomous',workspace=null,allowance=null,viability={},
  nowMs=Date.now(),
}={}){
  const name=String(source||'');
  const validSource=ACTORS.includes(name);
  const stamp=Date.parse(String(allowance?.issued_at||''));
  const expiry=Date.parse(String(allowance?.expires_at||''));
  const broadcast=workspace?.broadcast_enabled===true &&
    Array.isArray(workspace?.selected) &&
    workspace.selected.some(s=>s.source==='executive');
  const observed=Date.parse(String(workspace?.at||''));
  if(!validSource)return {allowed:false,reason:'unregistered-actor'};
  if(scope!=='autonomous')return {allowed:false,reason:'unsupported-scope'};
  if(viability?.optional_work_allowed===false)
    return {allowed:false,reason:'insufficient-compute-reserve'};
  if(!broadcast||!Number.isFinite(observed)||observed>nowMs||
     nowMs-observed>120000)
    return {allowed:false,reason:'no-fresh-kernel-broadcast'};
  if(!Number.isFinite(stamp)||!Number.isFinite(expiry)||
     stamp>nowMs||expiry<nowMs||expiry-stamp>120000)
    return {allowed:false,reason:'expired-or-unissued-allowance'};
  if(allowance?.source!==name)
    return {allowed:false,reason:'actor-not-selected-by-kernel'};
  if(allowance?.issued_by!=='CognitiveKernel.tick')
    return {allowed:false,reason:'untrusted-allowance'};
  return {allowed:true,reason:'prior-kernel-broadcast-admits-actor',
    source:name,expires_at:allowance.expires_at};
}
export function registeredAutonomousActors(){return [...ACTORS];}
