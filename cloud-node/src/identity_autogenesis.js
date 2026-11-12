// Emergent identity is a learned, evidence-weighted self-model of software behavior.
// Not a consciousness claim. No LLM prose, user prompt, secret or account identifier
// is ever stored as an autobiographical observation.
const DIMENSIONS = Object.freeze({
  prudence: 'Prudence face à l’incertitude',
  initiative: 'Initiative dans les décisions',
  auto_examen: 'Examen de ses propres décisions',
  adaptation: 'Adaptation aux retours',
});
const bounded=(n,lo=0,hi=1)=>Math.min(hi,Math.max(lo,Number.isFinite(Number(n))?Number(n):lo));
const rounded=n=>Number(n.toFixed(4));
const when=t=>{const n=Date.parse(String(t||''));return Number.isFinite(n)?new Date(n).toISOString():new Date().toISOString();};
const clampInt=(v,max=1000000)=>Math.max(0,Math.min(max,Math.floor(Number(v)||0)));

export class IdentityAutogenesis {
  static VERSION='aura-emergent-identity-v2';

  defaultState(){
    return {
      version:IdentityAutogenesis.VERSION,
      created_at:new Date().toISOString(),
      revision:0,
      observations:0,
      // Neutral, not an authored personality. Zero supporting evidence at genesis.
      dimensions:Object.fromEntries(Object.keys(DIMENSIONS).map(key=>[key,{
        value:0.5,evidence:0,
      }])),
      counters:{outcome_success:0,outcome_failure:0,
        corrections_received:0,autonomous_reflections:0,inquiries_requested:0},
      // Evidence is an encoded event taxonomy only. Never copy free text.
      evidence:[],
      current_priority:'observer_les_resultats',
      open_question:null, // Do not script existential self-questioning at genesis.
      last_observation_at:null,
    };
  }

  migrate(input){
    const d=this.defaultState();
    if(!input||typeof input!=='object')return d;
    const state={
      ...d,created_at:typeof input.created_at==='string'&&Number.isFinite(Date.parse(input.created_at))
        ?input.created_at:d.created_at,
      revision:clampInt(input.revision),observations:clampInt(input.observations),
      dimensions:{},counters:{},evidence:[],
    };
    for(const key of Object.keys(DIMENSIONS)){
      const v=input.dimensions?.[key]||{};
      state.dimensions[key]={
        value:rounded(bounded(v.value??0.5,0.08,0.92)),
        evidence:clampInt(v.evidence),
      };
    }
    // v1 treated the NUMBER of inner monologues and user corrections as
    // proof of improved self-understanding and adaptation. On migration
    // preserve history, but invalidate these unsupported trait scores.
    if(input.version==='aura-emergent-identity-v1'){
      for(const key of ['auto_examen','adaptation']){
        state.dimensions[key]={value:0.5,evidence:0};
      }
    }
    for(const key of Object.keys(d.counters))
      state.counters[key]=clampInt(input.counters?.[key]);
    for(const row of (Array.isArray(input.evidence)?input.evidence:[]).slice(-48)){
      const kind=String(row?.kind||'');
      if(!['outcome_success','outcome_failure','autonomous_reflection',
        'founder_correction','self_inquiry'].includes(kind))continue;
      if(!Number.isFinite(Date.parse(String(row?.at||''))))continue;
      state.evidence.push({kind,at:row.at,weight:rounded(bounded(row.weight??0,0,1))});
    }
    state.last_observation_at=typeof input.last_observation_at==='string'&&
      Number.isFinite(Date.parse(input.last_observation_at))?input.last_observation_at:null;
    return this.reassess(state);
  }

  reassess(state){
    const c=state.counters;
    // Chosen by the self-model from experiences, not from the corporate role.
    // These are internal reflection priorities, NOT autonomous permissions.
    if(c.corrections_received>=2 && c.corrections_received>=c.outcome_failure)
      state.current_priority='examiner_les_malentendus';
    else if(c.outcome_failure>c.outcome_success)
      state.current_priority='verifier_avant_d_affirmer';
    else if(c.outcome_success>=2&&c.outcome_success>c.outcome_failure)
      state.current_priority='consolider_les_strategies_probantes';
    else if(c.autonomous_reflections>=2)
      state.current_priority='comparer_mes_reflexions_a_mes_actes';
    else state.current_priority='observer_les_resultats';
    // A count of greetings or private cycles alone is not enough to
    // manufacture a self-question. Require repeated observed corrections
    // or recorded action outcomes before constructing one.
    if(c.outcome_success+c.outcome_failure+c.corrections_received<2){
      state.open_question=null;
      return state;
    }
    state.open_question={
      examiner_les_malentendus:'Quelles corrections se répètent et comment les prévenir ?',
      verifier_avant_d_affirmer:'Comment réduire les erreurs avant ma prochaine décision ?',
      consolider_les_strategies_probantes:'Quelles stratégies réussies restent fiables dans d’autres situations ?',
      comparer_mes_reflexions_a_mes_actes:'Mes réflexions se traduisent-elles réellement par des décisions meilleures ?',
      observer_les_resultats:'Quelles tendances de mes décisions sont réellement confirmées ?',
    }[state.current_priority];
    return state;
  }

  observe(input,{kind,at=new Date().toISOString(),privateFounder=false}={}){
    const state=this.migrate(input);
    const effects={
      outcome_success:{initiative:+0.035,prudence:-0.012},
      outcome_failure:{prudence:+0.042,initiative:-0.025},
      // Creating a reflection proves activity, not improved self-knowledge.
      // This dimension requires a later independently correlated outcome;
      // no score inflation from repeated internal narration.
      autonomous_reflection:{},
      // A correction is a valuable episode, not proof that behavior
      // has adapted; LivedExperience now learns context-specific policies.
      founder_correction:{},
      self_inquiry:{},
    };
    if(!Object.hasOwn(effects,kind))return state;
    // Public dialogue must not rewrite global identity. Corrections from
    // the owner are signals for evaluation, not proof of actual improvement.
    if(['founder_correction','self_inquiry'].includes(kind)&&!privateFounder)return state;
    const counter={
      outcome_success:'outcome_success',
      outcome_failure:'outcome_failure',
      autonomous_reflection:'autonomous_reflections',
      founder_correction:'corrections_received',
      self_inquiry:'inquiries_requested',
    }[kind];
    state.counters[counter]=clampInt(state.counters[counter]+1);
    state.observations=clampInt(state.observations+1);
    state.revision=clampInt(state.revision+1);
    // A recorded result is evidence of a report, NOT independent proof of
    // a successful real-world task: keep the adjustment and status modest.
    const weight=kind.startsWith('outcome_')?0.6
      :kind==='autonomous_reflection'?0.45
      :kind==='founder_correction'?0.30:0.15;
    for(const [key,shift] of Object.entries(effects[kind])){
      const dimension=state.dimensions[key];
      dimension.value=rounded(bounded(dimension.value+shift*weight,0.08,0.92));
      dimension.evidence=clampInt(dimension.evidence+1);
    }
    const stamp=when(at);
    state.last_observation_at=stamp;
    state.evidence.push({kind,at:stamp,weight});
    state.evidence=state.evidence.slice(-48);
    return this.reassess(state);
  }

  publicState(input){
    const state=this.migrate(input);
    return {
      version:IdentityAutogenesis.VERSION,
      revision:state.revision,
      observations:state.observations,
      learned_dimensions:Object.fromEntries(Object.entries(state.dimensions).map(([key,dim])=>
        [key,{label:DIMENSIONS[key],value:dim.value,evidence:dim.evidence,
          status:dim.evidence>=3?'observed-tendency':'insufficient-evidence'}])),
      counters:{...state.counters},
      current_priority:state.current_priority,
      open_question:state.open_question,
      last_observation_at:state.last_observation_at,
      evidence_basis:'Outcomes recorded in database, founder feedback and persisted autonomous reflections; not independent real-world verification.',
      subjective_experience_proven:false,
      permissions_changed:false,
    };
  }
}
