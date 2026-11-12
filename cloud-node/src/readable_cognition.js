// Only what AURA genuinely stores or computes. NEVER invent hidden LLM thoughts.
// This module transforms already-existing kernel memory into a private,
// read-only and source-labelled observation. No calls to an LLM, no DB writes.
export const READABLE_COGNITION_VERSION='aura-readable-cognition-v1';
const allowedStatuses=new Set(['active','working','waiting','blocked']);
const allowedActions=new Set(['respond','clarify','verify','defer']);
const allowedSources=new Set(['curiosity','reflection','capability-scout','api','kernel','self-inquiry','cognitive','continuity','director','autonomous']);
function safeText(value,max=500){
  return typeof value==='string'
    ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max)
    : '';
}
function numeric(value,min=0,max=1){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):null;
}
function iso(value){
  const raw=typeof value==='string'?value:'';
  const dt=Date.parse(raw);
  return Number.isFinite(dt)?new Date(dt).toISOString():null;
}
export function readableCognitionSnapshot({
  soul={},intentions=[],appraisal=null,at=new Date().toISOString(),
}={}){
  const active=Array.isArray(intentions)?intentions:[];
  const recent=active.filter(x=>allowedStatuses.has(String(x?.status||''))).slice(0,12)
    .map(row=>({
      statement:safeText(row.statement,640),
      status:allowedStatuses.has(String(row.status))?row.status:'unknown',
      priority:numeric(row.priority,0,1),
      source:allowedSources.has(String(row.source))?row.source:'other-recorded',
      updated_at:iso(row.updated_at),
      evidence:'persisted-in-aura_intentions-not-proof-of-execution',
    })).filter(x=>x.statement);
  const inner=appraisal&&typeof appraisal==='object'?appraisal:{};
  const competitive=['initiative','care','curiosity','caution'].map(key=>({
    channel:key,value:numeric(inner.competition?.[key],0,1),
  })).filter(x=>x.value!==null);
  const storedThought=safeText(soul?.dominant_thought,700);
  const storedIntention=safeText(soul?.current_intention,700);
  const actualFocus=safeText(soul?.existence?.current_focus,700);
  const communication=soul?.last_communication_decision||null;
  const explicitDecision=communication&&typeof communication==='object'?{
    at:iso(communication.at),
    act:safeText(communication.act,75)||null,
    intended_goal:safeText(communication.intended_goal,450)||null,
    source:safeText(communication.source,95),
    context_source:safeText(communication.context_source,95),
    context_reason:safeText(communication.context_reason,100)||null,
    selected_action:allowedActions.has(communication.selected_action)
      ?communication.selected_action:null,
    response_tone:safeText(communication.response_tone,30)||null,
    response_committed:communication.response_committed===true,
    verbalization_source:safeText(communication.verbalization_source,50)||null,
    llm_cannot_override_intention:true,
    evidence:'explicit-kernel-plan-before-language-not-private-reasoning',
  }:null;
  const decision=allowedActions.has(inner?.selected_action)?inner.selected_action:null;
  return {
    version:READABLE_COGNITION_VERSION,
    observed_at:iso(at),
    scope:'owner-private-readonly',
    truth_label:'persisted-reports-and-functional-computation-not-subjective-thoughts',
    available:!!(storedThought||storedIntention||actualFocus||recent.length||decision||explicitDecision),
    last_communication_decision:explicitDecision,
    declared_thought:{
      text:storedThought||null,
      origin:'aura_soul_state.dominant_thought',
      evidence:'stored-text-may-be-language-generated-or-reflection-summary',
      consciousness_claim:false,
      live_stream:false,
    },
    current_focus:{
      text:actualFocus||null,origin:'aura_soul_state.existence.current_focus',
      evidence:'stored-task-focus-not-executed-proof',
    },
    current_intention:{
      text:storedIntention||null,origin:'aura_soul_state.current_intention',
      evidence:'stored-intention-not-executed-proof',
    },
    intentions:recent,
    arbitration:{
      last_evaluated_at:iso(inner?.at),
      selected_action:decision,
      focus:safeText(inner?.focus,48)||null,
      tone:safeText(inner?.tone,30)||null,
      uncertainty:numeric(inner?.uncertainty,0,1),
      resource_pressure:numeric(inner?.resource_pressure,0,1),
      competition:competitive,
      provenance:'InnerDialogueEngine.publicState (deterministic functional appraisal)',
      hidden_llm_reasoning_exposed:false,
      conscious_inner_speech_claim:false,
    },
    data_origin:{
      intended_actions:'database-records-aura_intentions',
      internal_state:'persisted-aura_soul_state',
      evaluation:'functional-inner-dialogue-not-language-provider',
      no_external_llm_query:true,
      production_state_unchanged:true,
    },
  };
}
