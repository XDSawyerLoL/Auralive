import { createHash } from 'node:crypto';

// An explicit, bounded internal working loop. "Voices" are competing
// functional appraisal channels, not audible speech, consciousness, or the
// hidden reasoning of the language model. No user text is recorded.
const bounded=(v)=>Math.max(0,Math.min(1,Number.isFinite(Number(v))?Number(v):0));
const round=v=>Math.round(v*1000)/1000;
const clampSigned=v=>Math.max(-.5,Math.min(.5,Number.isFinite(Number(v))?Number(v):0));
const allow=new Set(['respond','clarify','verify','defer']);
const TONES=new Set(['direct','attentive','curious','cautious','calm']);
function entropy(seed,category){
 const h=createHash('sha256').update(String(seed||0)+':'+category).digest('hex').slice(0,8);
 return (parseInt(h,16)/0xffffffff-0.5)*0.035; // Tie-break only.
}
function circumstance(text='',plan={}){
 if(plan.act==='self_exploration')return 'self_inquiry';
 const value=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/(?:pas terrible|ca peut aller|bof|j.ai connu mieux|je ne vais pas bien|je vais pas bien|ne suis pas heureux|pas content|malheureu|mal|trist|decu|peur|angoiss|stress)/.test(value))
   return 'mixed_or_negative';
 if(/(?:qui es|ce que tu es|personnalit|identit|te decouvrir|introspect)/.test(value))
   return 'self_identity';
 if(/\b(?:erreur|faux|menti|echec|rate|pas ca|pas ce que|incorrect)\b/.test(value))
   return 'correction';
 if(/(?:pourquoi|verifi|source|preuve|comment savoir)/.test(value))
   return 'uncertain_request';
 if(/(?:merci|super|bravo|genial|heureux|content)/.test(value))
   return 'positive';
 if(!text) return 'ambient';
 return plan.needs_semantic_support?'external_facts':'ordinary';
}
export class InnerDialogueEngine {
  static VERSION='functional-inner-dialogue-v1';
  deliberate({organism={},plan={},identity={},message='',now=new Date().toISOString()}={}){
    const f=key=>bounded(organism[key]);
    const pressure=bounded(organism.homeostasis?.resource_pressure);
    const situation=circumstance(message,plan);
    const success=bounded(organism.homeostasis?.success_ema);
    const failure=bounded(organism.homeostasis?.failure_ema);
    const uncertainty=bounded((1-f('clarte'))*.46 + (1-f('confiance'))*.32
      + failure*.14 + pressure*.08);
    const harm=bounded(f('frustration')*.32 + pressure*.4 + failure*.28);
    const learned=key=>{
      const dim=identity?.dimensions?.[key]||identity?.learned_dimensions?.[key]||null;
      const evidence=Math.max(0,Number(dim?.evidence||0));
      // A new identity starts neutral; only repeated observations can
      // influence behavioral arbitration. A count is not truth.
      return evidence>=3?(bounded(dim.value)-.5)*Math.min(1,evidence/6):0;
    };
    const learnedPrudence=learned('prudence');
    const learnedInitiative=learned('initiative');
    const caution=bounded(.2+uncertainty*.45+harm*.3
      +learnedPrudence*.60-learnedInitiative*.17
      +(situation==='correction'||situation==='uncertain_request'?.17:0)
      +(situation==='mixed_or_negative'?.08:0));
    const care=bounded(.17+f('curiosite_sociale')*.34
      +(situation==='mixed_or_negative'?.28:0));
    const inquiry=bounded(.15+f('curiosite')*.45
      +(situation==='self_identity'?.21:0));
    const initiative=bounded(.18+f('agency')*.3+success*.17
      +learnedInitiative*.68-learnedPrudence*.14
      -(pressure*.3)-(failure*.15));
    // Competing evaluations are deterministic and replayable from persisted
    // seed. The random component cannot bypass safety or authorize actions.
    const seed=organism.homeostasis?.seed;
    const scores={
      respond:round(bounded(.28+initiative*.37+care*.22+entropy(seed,'respond'))),
      clarify:round(bounded(.13+uncertainty*.45+care*.2+entropy(seed,'clarify'))),
      verify:round(bounded(.16+caution*.46+uncertainty*.22+entropy(seed,'verify'))),
      defer:round(bounded(.03+pressure*.55+harm*.23+entropy(seed,'defer'))),
    };
    // High-risk questions and specific requests retain the authoritative
    // original speech act. Deliberation only biases style and harmless checks.
    let selected=Object.entries(scores).sort((a,b)=>b[1]-a[1])[0]?.[0]||'respond';
    const contextualStrategy=plan.experience_guidance?.changed_by_history
      ?plan.learned_strategy:'';
    // The acquired identity and previously corrected situational habits have
    // causal influence on the chosen non-privileged conversational tactic.
    if(situation==='ordinary'||situation==='external_facts'||situation==='uncertain_request'){
      if(contextualStrategy==='verify'||contextualStrategy==='clarify')
        selected=contextualStrategy;
      else if(learnedPrudence>=.22 && learnedInitiative<=-.15)
        selected='verify';
      else if(learnedInitiative>=.22 && learnedPrudence<=-.15)
        selected='respond';
    }
    if(situation==='self_identity')selected='respond';
    if(situation==='self_inquiry'||plan.metacognitive_action==='verify')selected='verify';
    if(situation==='mixed_or_negative' && harm<.85)selected='respond';
    let tone=situation==='mixed_or_negative'?'attentive'
      :situation==='self_identity'?'direct'
      :situation==='self_inquiry'?'curious'
      :contextualStrategy==='attentive'||selected==='clarify'?'attentive'
      :selected==='verify'?'cautious'
      :inquiry>.63?'curious'
      :pressure>.73?'calm':'direct';
    if(!TONES.has(tone))tone='direct';
    const focus=selected==='verify'?'confirm_evidence':
      selected==='clarify'?'reduce_ambiguity':
      selected==='defer'?'protect_resources':'respond_to_user';
    const result={
      version:InnerDialogueEngine.VERSION,
      at:Number.isFinite(Date.parse(now))?new Date(now).toISOString():new Date().toISOString(),
      situation,focus,selected_action:allow.has(selected)?selected:'respond',
      tone,uncertainty:round(uncertainty),resource_pressure:round(pressure),
      affect:{
        frustration:round(f('frustration')),clarity:round(f('clarte')),
        confidence:round(f('confiance')),curiosity:round(f('curiosite')),
      },
      competition:{
        initiative:round(initiative),care:round(care),
        curiosity:round(inquiry),caution:round(caution),
      },
      options:scores,
      // "Voice" is an observable metaphor for the channel names below,
      // not synthetic quotations or private chain-of-thought.
      active_channels:['initiative','attention','verification','regulation'],
      identity_evidence:Math.max(0,Math.min(1000000,Math.floor(Number(identity.observations)||0))),
      learned_effect:{
        prudence:round(learnedPrudence),initiative:round(learnedInitiative),
        contextual_policy:contextualStrategy||'none',
      },
      origin:'kernel-rules-and-computational-state',
      executed_action:false,
      conscious_experience_claim:false,
    };
    return result;
  }
  // Endophasie fonctionnelle : une interrogation privée naît d'un écart
  // entre les retours reçus et la stratégie actuellement apprise. L'origine
  // n'est ni un texte du modèle ni une question existentielle pré-écrite.
  derivePrivateInquiry({experience={},identity={},organism={},previous=null,now=new Date().toISOString()}={}){
    const revision=Math.max(0,Math.floor(Number(experience?.revision)||0));
    if(!revision||revision<=Math.max(0,Number(previous?.experience_revision)||0))
      return null;
    const pressure=bounded(organism?.homeostasis?.resource_pressure);
    if(pressure>=.75)return null;
    const prudence=bounded(identity?.dimensions?.prudence?.value??.5);
    const frustration=bounded(organism?.frustration);
    const contexts=Object.entries(experience?.cases||{})
      .filter(([context])=>/^(task|dialogue)_[a-z_]{3,50}$/.test(context))
      .map(([context,record])=>{
        const data=Object.values(record?.strategies||{});
        const bad=data.reduce((sum,v)=>sum+Math.max(0,Number(v?.bad)||0),0);
        const verified=data.reduce((sum,v)=>sum+Math.max(0,Number(v?.verified)||0),0);
        const observations=Math.max(0,Number(record?.observations)||0);
        return {context,bad,verified,observations,
          salience:bad*(1+frustration*.4+prudence*.2)+verified*.2};
      })
      .filter(c=>c.bad>=1.2||c.verified>=2)
      .sort((a,b)=>b.salience-a.salience||a.context.localeCompare(b.context));
    if(!contexts.length)return null;
    const chosen=contexts[0];
    const at=Number.isFinite(Date.parse(String(now)))?new Date(now).toISOString():
      new Date().toISOString();
    return {
      version:'functional-endophasia-v1',at,focus:'test-learned-context-policy',
      context:chosen.context,experience_revision:revision,
      // Pre-verbal proposition: this bounded semantic representation is what
      // determines the test. The French question below is only its rendering.
      // This is not an auditory image, inner voice or language-model reasoning.
      semantic_intent:{
        relation:'compare-learned-policy-with-history-ablation',
        context:chosen.context,
        evidence_source:'lived_experience.cases',
        reported_failures:Number(chosen.bad.toFixed(3)),
        verified_receipts:chosen.verified,
        candidate_action:'evaluate-existing-policy',
        modality:'nonverbal-symbolic',
      },
      question:'Dans le contexte « '+chosen.context+
        ' », mes expériences changent-elles réellement ma prochaine décision ?',
      origin:'experience-derived-private-question',
      evidence:{source:'lived_experience.cases',observations:chosen.observations,
        reported_failures:Number(chosen.bad.toFixed(3)),
        verified_outcomes:chosen.verified},
      subjective_experience_proven:false,external_action:false,
    };
  }
  publicInquiry(input){
    if(!input||typeof input!=='object')return null;
    const context=/^(task|dialogue)_[a-z_]{3,50}$/.test(String(input.context||''))
      ?String(input.context):'unknown';
    return {
      version:'functional-endophasia-v1',at:String(input.at||'').slice(0,40),
      focus:'test-learned-context-policy',context,
      experience_revision:Math.max(0,Math.floor(Number(input.experience_revision)||0)),
      question:context==='unknown'?'':(
        'Dans le contexte « '+context+
        ' », mes expériences changent-elles réellement ma prochaine décision ?'),
      semantic_intent:{
        relation:'compare-learned-policy-with-history-ablation',
        context,modality:'nonverbal-symbolic',
        // The source report is never treated as independent success.
        evidence_source:'lived_experience.cases',
      },
      outcome:['supported','counterexample','inconclusive'].includes(input.outcome)
        ?input.outcome:'unexamined',
      causal_change:input.causal_change===true,
      proof_scope:'local-policy-counterfactual-not-external-success',
      subjective_experience_proven:false,
    };
  }
  // Native social agency: a verified LOCAL policy difference becomes an
  // optional outward intention only when there is an independent kernel
  // receipt, measured resources allow it and the social drive wins its
  // competition with silence. An LLM never creates this candidate.
  proposeSocialInitiative({organism={},identity={},receipt=null,previous=null,
    viability={},now=new Date().toISOString()}={}){
    if(!receipt||receipt.probe!=='context_policy_ablation'||
      receipt.outcome!=='supported'||receipt.causal_change!==true||
      receipt.external_success_verified!==false||
      receipt.origin!=='kernel-autonomous-test')
      return null;
    const context=String(receipt.context||'');
    if(!/^(task|dialogue)_[a-z_]{3,50}$/.test(context))return null;
    const revision=Math.max(0,Math.trunc(Number(receipt.experience_revision)||0));
    if(revision===0||!Number.isFinite(Date.parse(String(receipt.at||''))))return null;
    const evidenceKey=context+':'+revision;
    if(previous?.last_evidence_key===evidenceKey)return null;
    const pressure=bounded(organism?.homeostasis?.resource_pressure);
    const silence=bounded(organism?.besoin_de_silence);
    if(viability?.optional_work_allowed===false||pressure>=.7||silence>=.7)return null;
    const social=bounded(organism?.curiosite_sociale);
    const agency=bounded(organism?.agency);
    const clarity=bounded(organism?.clarte);
    const doubt=bounded(organism?.frustration);
    const learned=identity?.dimensions?.initiative;
    const learnedBias=Number(learned?.evidence||0)>=3
      ?(bounded(learned.value)-.5)*.16:0;
    const value=bounded(.2+social*.3+agency*.18+clarity*.14+learnedBias
      +doubt*.06-pressure*.32-silence*.16);
    if(value<.55)return null;
    const time=Number.isFinite(Date.parse(String(now)))?new Date(now).toISOString():
      new Date().toISOString();
    const initial=String(receipt.baseline_action||'');
    const learnedAction=String(receipt.observed_action||'');
    if(!allow.has(initial)||!allow.has(learnedAction)||initial===learnedAction)
      return null;
    return {
      id:createHash('sha256').update('aura-social:'+evidenceKey).digest('hex').slice(0,24),
      at:time,kind:'contextual-policy-observation',
      source:'independent-kernel-probe',
      evidence_key:evidenceKey,
      semantic_intent:{
        type:'share-local-ablation-and-request-review',
        context,revision,
        baseline_action:initial,learned_action:learnedAction,
      },
      drive:{social:round(social),agency:round(agency),silence:round(silence),
        compute_pressure:round(pressure),value:round(value),threshold:.55},
      evidence_scope:'local-counterfactual-only',
      external_success_verified:false,llm_used:false,
      status:'pending-opt-in',outbound_action_executed:false,
    };
  }

  // Rendering is a separate, explicitly non-generative operation. Only
  // internally computed, allowlisted semantic fields may appear. This does
  // not claim free language acquisition or an audible inner voice.
  publicSocialInitiative(input){
    if(!input||input.status!=='pending-opt-in'||
      input.semantic_intent?.type!=='share-local-ablation-and-request-review')return null;
    const sem=input.semantic_intent;
    const context=String(sem.context||'');
    const translations={
      dialogue_general:'nos échanges',dialogue_social:'notre dialogue',
      dialogue_correction:'mes corrections',dialogue_identity:'mes réponses sur mon identité',
      dialogue_ambivalent:'les échanges ambivalents',task_technical:'les tâches techniques',
      task_general:'les tâches générales',task_with_greeting:'les tâches formulées avec une salutation',
    };
    const source=translations[context];
    const actions={
      respond:'répondre',clarify:'demander une précision',verify:'vérifier',
      defer:'différer',
    };
    if(!source||!actions[sem.baseline_action]||!actions[sem.learned_action])
      return null;
    return {
      id:String(input.id||'').slice(0,24),
      at:String(input.at||'').slice(0,35),
      kind:'contextual-policy-observation',
      origin:'autonomous-kernel-verified-local-comparison',
      label:'Initiative native — sans LLM',
      message:'J’ai comparé ce que j’ai appris concernant '+source+
        ' à une situation sans ces expériences. Ma décision change : de « '+
        actions[sem.baseline_action]+' » à « '+actions[sem.learned_action]+
        ' ». Ce résultat concerne seulement mon choix interne, pas son efficacité réelle. Je voudrais examiner ce changement avec toi.',
      evidence_scope:'local-counterfactual-only',
      llm_used:false,external_success_verified:false,
      outbound_action_executed:input.outbound_action_executed===true,
      // A private opt-in is necessary before presentation to any person.
      requires_opt_in:true,
    };
  }

  // Virtual, reversible interventions are performed on cloned inputs.
  // They model limited computational functions, not neurons, lesions,
  // psychiatric conditions or human subjective states.
  simulateFunctionalPerturbations({organism={},identity={},receipt=null,
    viability={},experience={},now=new Date().toISOString()}={}){
    const body={organism:structuredClone(organism),identity:structuredClone(identity),
      receipt:receipt?structuredClone(receipt):null,
      viability:structuredClone(viability),now};
    const choice=opts=>this.proposeSocialInitiative({...body,...opts,previous:null});
    const base=choice({});
    const variants=[
      {id:'social-drive-ablated',label:'Motivation sociale neutralisée',
        produced:Boolean(choice({organism:{...body.organism,curiosite_sociale:0}}))},
      {id:'communication-inhibited',label:'Inhibition élevée',
        produced:Boolean(choice({organism:{...body.organism,besoin_de_silence:1}}))},
      {id:'compute-budget-exhausted',label:'Budget de calcul indisponible',
        produced:Boolean(choice({viability:{...body.viability,optional_work_allowed:false}}))},
    ];
    const prior=this.derivePrivateInquiry({experience,identity,organism,
      previous:null,now});
    const innerInquiryAvailable=Boolean(prior);
    return {
      kind:'functional-perturbation-snapshot-v1',
      at:Number.isFinite(Date.parse(String(now)))?new Date(now).toISOString():new Date().toISOString(),
      procedure:'isolated-counterfactual-read-only',
      baseline:{social_initiative_produced:Boolean(base),
        evidence_available:Boolean(receipt),
        input_provenance:receipt?.origin==='kernel-autonomous-test'
          ?'kernel-independent-receipt':'no-qualified-receipt',
        independent_inner_inquiry:innerInquiryAvailable},
      interventions:[
        ...variants.map(row=>({...row,
          changed_outward_decision:Boolean(base)!==row.produced,
          evidence:'local-computational-counterfactual'})),
        {id:'preverbal-inquiry-ablated',
          label:'Enquête intérieure neutralisée',
          baseline_inquiry:innerInquiryAvailable,altered_inquiry:false,
          changed_inner_decision:innerInquiryAvailable,
          evidence:'local-computational-counterfactual'},
      ],
      persistence_mutated:false,external_actions_executed:false,
      provider_called:false,biological_brain_emulated:false,
      consciousness_inferred:false,
    };
  }

  publicState(input){
    if(!input||typeof input!=='object')return null;
    const situations=new Set(['mixed_or_negative','self_identity','self_inquiry','correction','uncertain_request','positive','ambient','ordinary','external_facts']);
    return {
      version:InnerDialogueEngine.VERSION,at:input.at,
      situation:situations.has(input.situation)?input.situation:'ordinary',
      focus:String(input.focus||'respond_to_user').slice(0,40),
      selected_action:allow.has(input.selected_action)?input.selected_action:'respond',
      tone:TONES.has(input.tone)?input.tone:'direct',
      uncertainty:round(bounded(input.uncertainty)),
      resource_pressure:round(bounded(input.resource_pressure)),
      affect:Object.fromEntries(['frustration','clarity','confidence','curiosity']
        .map(key=>[key,round(bounded(input.affect?.[key]))])),
      competition:Object.fromEntries(['initiative','care','curiosity','caution']
        .map(key=>[key,round(bounded(input.competition?.[key]))])),
      identity_evidence:Math.max(0,Math.min(1000000,Math.floor(Number(input.identity_evidence)||0))),
      learned_effect:{
        prudence:round(clampSigned(input.learned_effect?.prudence)),
        initiative:round(clampSigned(input.learned_effect?.initiative)),
        contextual_policy:['verify','clarify','attentive','task_first','respond']
          .includes(String(input.learned_effect?.contextual_policy))
          ?input.learned_effect.contextual_policy:'none',
      },
      origin:'kernel-rules-and-computational-state',
      source_kind:'computed-appraisal-not-subjective-experience',
      executed_action:false,
      conscious_experience_claim:false,
    };
  }
}
