// A mandatory, bounded, read-only boundary for modules invoking language and
// operational tooling. It cannot itself grant an external permission.
const receive=(workspace,recipient)=>
  Array.isArray(workspace?.received?.[recipient])&&workspace?.broadcast_enabled===true
    ?workspace.received[recipient]:[];
export function workspaceHas(workspace,recipient,source){
  return receive(workspace,recipient).some(s=>s.source===source);
}
export function languageWorkspaceProjection(plan={},workspace,{privateView=false}={}){
  if(!workspaceHas(workspace,'prefrontal','perception'))
    return {allowed:false,reason:'no-perceptual-broadcast',plan:null};
  const memory=workspaceHas(workspace,'hippocampus','memory');
  const metacognition=workspaceHas(workspace,'metacognition','metacognition');
  const result={...plan,private_view:privateView===true};
  if(!memory){
    // No historical facts may reach a provider through the legacy context
    // channel when the corresponding module lost the workspace competition.
    result.experiential_memory=[];
    result.conversation_context=[];
    if(!['self_exploration','topic_shift','user_asks_if_interrupting',
      'user_reports_aura_interrupts'].includes(result.act))
      result.facts=[];
    result.founder_profile=[];
    result.history_guidance=null;
    result.lived_experience=null;
    result.continuity_report=null;
    result.current_intention='';
    result.dominant_thought='';
    result.relationship={};
    result.executive={};
    result.self_model={};
    // A plan's free-form facts often merge user observations and older
    // recollections. Preserve only the current turn; leave private facts out.
    if(result.act==='user_recognition')
      result.facts=['Cette vérification nécessite un souvenir admis dans mon espace de travail.'];
  }
  if(!metacognition){
    result.metacognitive_guidance=null;
    result.metacognitive_action='';
    result.self_inquiry_report=null;
  }
  result.global_workspace={
    focus:String(workspace.decision?.attention||'none').slice(0,32),
    control:String(workspace.decision?.control||'normal').slice(0,16),
    sources:receive(workspace,'prefrontal').map(s=>s.source),
    evidence:'bounded-observed-broadcast',
  };
  return {allowed:true,reason:'perception-delivered',
    memory_included:memory,metacognition_included:metacognition,plan:result};
}
export function semanticWorkspaceContext(context='',workspace){
  return workspaceHas(workspace,'hippocampus','memory')
    ?String(context||'').slice(0,6000):'';
}
export function executionWorkspaceGate(workspace,{recipient='prefrontal'}={}){
  const delivered=receive(workspace,recipient);
  const selected=delivered.some(s=>s.source==='executive'||s.source==='perception');
  return {
    allowed:selected,
    reason:selected?'plan-broadcast':'plan-not-broadcast',
    authorization_granted:false, // still requires the external tool's permissions
    action_type:'candidate-not-authorized',
  };
}
