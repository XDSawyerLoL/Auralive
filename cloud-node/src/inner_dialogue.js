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
