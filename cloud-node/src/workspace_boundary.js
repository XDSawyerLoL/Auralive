// One broadcast supplies only exact memory references, never a blanket
// authorization to query or serialize the owner's whole memory.
const receive=(workspace,recipient)=>
  Array.isArray(workspace?.received?.[recipient])&&workspace?.broadcast_enabled===true
    ?workspace.received[recipient]:[];
export function workspaceHas(workspace,recipient,source){
  return receive(workspace,recipient).some(s=>s.source===source);
}
export function selectedMemoryRefs(workspace){
  // Read the hippocampal RECEIVER output, not the raw broadcast itself.
  // A muted hippocampus must lose the ability to expose memory.
  return new Set((Array.isArray(workspace?.processed?.hippocampus?.references)
    ?workspace.processed.hippocampus.references:[])
    .filter(ref=>/^(?:note|message):[0-9a-f-]{1,40}$/i.test(ref)));
}
const rowReference=(row,kind)=>kind+':'+String(row?.id??'');
export function selectBroadcastMemories(workspace,{
  notes=[],messages=[],founderProfile=[],
}={}){
  const refs=selectedMemoryRefs(workspace);
  const selectedNotes=(Array.isArray(notes)?notes:[]).filter(x=>
    refs.has(rowReference(x,'note'))).slice(0,3);
  const selectedMessages=(Array.isArray(messages)?messages:[]).filter(x=>
    refs.has(rowReference(x,'message'))).slice(-3);
  const selectedFounder=(Array.isArray(founderProfile)?founderProfile:[]).filter(x=>
    refs.has(rowReference(x,'note'))).slice(0,3);
  return {notes:selectedNotes,messages:selectedMessages,
    founderProfile:selectedFounder,refs:[...refs]};
}
export function languageWorkspaceProjection(plan={},workspace,{privateView=false,immediateDialogue=[],nativeSessionFacts=[]}={}){
  if(!workspaceHas(workspace,'prefrontal','perception'))
    return {allowed:false,reason:'no-perceptual-broadcast',plan:null};
  const refs=selectedMemoryRefs(workspace);
  const memory=refs.size>0;
  const metacognition=workspaceHas(workspace,'metacognition','metacognition');
  const result={...plan,private_view:privateView===true};
  // Refuse every unattributed / non-matching memory field. History-policy
  // broadcast changes strategy but NEVER opens another memory by category.
  result.experiential_memory=(Array.isArray(plan.experiential_memory)
    ?plan.experiential_memory:[]).filter(row=>
      refs.has('note:'+String(row?.id||''))||
      refs.has('message:'+String(row?.id||''))).slice(0,4);
  result.conversation_context=(Array.isArray(plan.conversation_context)
    ?plan.conversation_context:[]).filter(row=>
      refs.has(rowReference(row,'message'))).slice(-3);
  // Perception-gated immediate dialogue is NOT a grant for long-term memory.
  // Only the trusted kernel passes the last few rows from the same session.
  result.immediate_dialogue_context=(Array.isArray(immediateDialogue)
    ?immediateDialogue:[]).filter(row=>
      row?.source==='same-session-immediate-turn'&&
      ['user','assistant'].includes(String(row?.role))&&
      /^\d+$/.test(String(row?.id??''))).slice(-18).map(row=>({
      id:row.id,role:row.role,content:String(row.content||'').slice(0,550),
    }));
  // Trust only records retrieved by the kernel from the exact SQL session.
  // Caller-provided plan.native_session_preferences is deliberately overwritten.
  result.native_session_preferences=(Array.isArray(nativeSessionFacts)
    ?nativeSessionFacts:[]).filter(f=>
      f?.source==='same-session-sql-experience'&&
      f?.schema==='aura-session-discourse-fact-v1'&&
      f?.provenance==='explicit-user-disclosure'&&
      f?.scope==='same-session-only'&&
      ['name','favorite','preference','like'].includes(f.kind)&&
      typeof f.key==='string'&&f.key.length<=65&&
      typeof f.value==='string'&&f.value.length<=75&&
      typeof f.positive==='boolean'
    ).slice(-64).map(f=>({
      schema:f.schema,kind:f.kind,key:f.key,value:f.value,
      positive:f.positive,provenance:f.provenance,scope:f.scope,
    }));
  result.founder_profile=(Array.isArray(plan.founder_profile)
    ?plan.founder_profile:[]).filter(row=>
      refs.has(rowReference(row,'note'))).slice(0,3);
  // Free-form derived facts have no reliable source ID. They can be
  // supplied only through a dedicated current-turn, nonhistorical claim.
  if(!memory){
    result.history_guidance=null;
    result.lived_experience=null;
    result.continuity_report=null;
    result.current_intention='';
    result.dominant_thought='';
    result.relationship={};
    result.executive={};
    result.self_model={};
    if(!['self_exploration','topic_shift','user_asks_if_interrupting',
      'user_reports_aura_interrupts'].includes(result.act))result.facts=[];
    if(result.act==='user_recognition')
      result.facts=['Je ne dispose pas de souvenir individuel sélectionné pour cette question.'];
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
    selected_memory_refs:[...refs],
    evidence:'individual-reference-broadcast',
  };
  return {allowed:true,reason:'perception-delivered',
    memory_included:memory,selected_memory_refs:[...refs],
    metacognition_included:metacognition,plan:result};
}
export function semanticWorkspaceContext(records=[],workspace){
  // Legacy free-form contextForAi strings must never bypass the individual
  // memory gate, even when a history policy won selection.
  if(!Array.isArray(records))return '';
  const refs=selectedMemoryRefs(workspace);
  return records.filter(row=>refs.has(rowReference(row,row.kind==='note'?'note':'message')))
    .slice(0,5).map(row=>
      '['+String(row.kind==='note'?'note':'message')+':'+String(row.id)+'] '+
      String(row.content||'').replace(/\s+/g,' ').slice(0,450)).join('\n');
}
export function executionWorkspaceGate(workspace,{recipient='prefrontal'}={}){
  const delivered=receive(workspace,recipient);
  const selected=delivered.some(s=>s.source==='executive'||s.source==='perception');
  return {allowed:selected,reason:selected?'plan-broadcast':'plan-not-broadcast',
    authorization_granted:false,action_type:'candidate-not-authorized'};
}
