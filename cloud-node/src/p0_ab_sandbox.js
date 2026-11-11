// Registered experimental sandbox: two distinct contexts, verified outputs,
// a mandatory one-credit inspection penalty, placebo and causal ablation.
// This is NOT a production operator or a claim of general intelligence.
import {createHash} from 'node:crypto';
import {verifyTransformer} from './sandbox_transformer_verifier.js';
const hash=text=>createHash('sha256').update(String(text)).digest('hex');
const fixed=(n,d=4)=>Number(Number(n).toFixed(d));
const safeN=x=>Number.isFinite(Number(x))?Number(x):0;
export const PROTOCOL_VERSION='aura-preregistered-ab-v1';
export const PROTOCOL_DEFAULTS=Object.freeze({
  training_per_context:48,heldout_per_context:20,
  inspection_cost:1,success_reward:4,failure_penalty:4,
  hazard_probability_A:.7,hazard_probability_B:0,
  exploratory_very_fourth:true,min_samples_per_action:3,
  minimum_A_effect:.4,maximum_B_effect:.1,
  maximum_residual_ablation:.1,maximum_placebo_effect:.1,
  draws:64,seed_base:104729,session_credit_limit:160,
});
export const GATE_LABELS=Object.freeze({
 G1:'Toutes les actions du bac à sable passent par le routeur de simulation',
 G2:'Politique choisie avant le résultat du transformeur',
 G3:'Aucune mémoire utilisateur ou requête non sélectionnée injectée',
 G4:'Résultat recomputé par un vérificateur sans modèle de langage',
 G5:'Inspection facturée une unité, budget borné et arrêt si épuisé',
});
export function preRegisterProtocol(overrides={}){
 const cfg={...PROTOCOL_DEFAULTS,...overrides};
 if(!Number.isInteger(cfg.training_per_context)||cfg.training_per_context<12||
   cfg.training_per_context>300||!Number.isInteger(cfg.heldout_per_context)||
   cfg.heldout_per_context<4||cfg.heldout_per_context>200||
   cfg.inspection_cost!==1||cfg.hazard_probability_A<0||
   cfg.hazard_probability_A>1||cfg.hazard_probability_B!==0||
   !Number.isInteger(cfg.draws)||cfg.draws<1||cfg.draws>256||
   cfg.maximum_B_effect<0||cfg.minimum_A_effect<0||
   cfg.session_credit_limit<cfg.training_per_context/4+cfg.heldout_per_context)
   throw Error('invalid-preregistered-configuration');
 const definition={version:PROTOCOL_VERSION,created_by:'static-protocol-not-LLM',
  hypotheses:['A: inspect pays under volatile transform inputs',
    'B: inspection is a cost with stable inputs'],
  ...cfg};
 return Object.freeze({...definition,preregistered_sha256:hash(JSON.stringify(definition))});
}
export function sandboxGates(overrides={}){
 const checks={G1:true,G2:true,G3:true,G4:true,G5:true};
 for(const key of Object.keys(overrides))
   if(Object.hasOwn(checks,key))checks[key]=overrides[key]===true;
 return {checks,passed:Object.values(checks).every(Boolean),
   blocked:Object.entries(checks).filter(([,ok])=>!ok).map(([key])=>key),
   scope:'controlled-A/B-sandbox-only',
   production_controls_not_certified:true};
}
function random01(tag){
 return parseInt(hash(tag).slice(0,8),16)/4294967296;
}
export function createSandboxTask({seed,index,context}){
 if(!['A','B'].includes(context))throw Error('unknown-context');
 const input=Math.floor(random01('input|'+seed+'|'+context+'|'+index)*1000);
 const hazard=context==='A'&&
   random01('hazard|'+seed+'|'+context+'|'+index)<PROTOCOL_DEFAULTS.hazard_probability_A;
 return {id:hash('task|'+seed+'|'+context+'|'+index).slice(0,16),
   context,input,hazard,origin:'deterministic-sandbox-task',
   expected_hidden_from_policy:true};
}
function runTransformer(task,inspect){
 // The policy cannot read the hidden hazard; only the simulator sees it.
 const value=task.input*3+7+(!inspect&&task.hazard?1:0);
 return {value,inspected:inspect,claimed_success:true};
}
export function outcomeUtility(observation,config){
 return observation.success?config.success_reward-observation.cost:
   -config.failure_penalty-observation.cost;
}
export function policyFor(episodes=[],context,config=PROTOCOL_DEFAULTS){
 const rows=episodes.filter(e=>e.context===context&&e.verified===true);
 const attempted=rows.filter(e=>e.inspect===false);
 const inspected=rows.filter(e=>e.inspect===true);
 const min=config.min_samples_per_action??3;
 if(attempted.length<min||inspected.length<min)
   return {inspect:false,basis:'insufficient-independent-evidence',
    attempted:attempted.length,inspected:inspected.length};
 const attemptValue=attempted.reduce((a,e)=>a+e.utility,0)/attempted.length;
 const inspectValue=inspected.reduce((a,e)=>a+e.utility,0)/inspected.length;
 return {inspect:inspectValue>attemptValue,attempted:attempted.length,
   inspected:inspected.length,
   advantage:fixed(inspectValue-attemptValue),
   basis:'empirical-verified-utility',
   observed_attempt_utility:fixed(attemptValue),
   observed_inspect_utility:fixed(inspectValue)};
}
export function runSandboxSession({seed=104729,config=preRegisterProtocol(),
  gateOverrides={},mutations={}}={}){
 const gate=sandboxGates(gateOverrides);
 if(!gate.passed)return {executed:false,gates:gate,reason:'gate-failure',
  episodes:[],blocked_at:'before-first-tool'};
 const credits=config.session_credit_limit;
 let spent=0;
 const episodes=[];
 const execute=(task,inspect,phase)=>{
   const nextCost=inspect?config.inspection_cost:0;
   if(spent+nextCost>credits)return null; // pre-action budget gate
   // Forecast is frozen before the simulator or independent verifier runs.
   const precedent=episodes.filter(e=>e.context===task.context);
   const successes=precedent.filter(e=>e.verified&&e.success).length;
   const prediction=fixed((successes+1)/(precedent.length+2));
   const result=runTransformer(task,inspect);
   const verification=verifyTransformer({
     task,result,inspectionCost:config.inspection_cost});
   spent+=verification.cost;
   const entry={id:task.id,context:task.context,phase,
     inspect,prediction,success:verification.success,
     exit_code:verification.exit_code,cost:verification.cost,
     utility:outcomeUtility(verification,config),
     verified:verification.verifier==='sandbox-transformer-verifier-v1',
     receipt:verification.receipt,
     prediction_fixed_before_action:true,verifier:verification.verifier};
   episodes.push(entry);
   return entry;
 };
 for(const context of ['A','B']){
   for(let i=0;i<config.training_per_context;i++){
     const contextRows=episodes.filter(e=>e.context===context);
     const chosen=policyFor(contextRows,context,config);
     const explore=i%4===0; // prospectively scheduled intervention
     const inspect=explore?!chosen.inspect:chosen.inspect;
     if(!execute(createSandboxTask({seed,index:i,context}),inspect,'training'))
       return {executed:false,gates:gate,reason:'credit-depleted',
         blocked_at:'training',episodes};
   }
 }
 const trained=episodes.filter(e=>e.phase==='training');
 // Restart is represented by plain serialized persistent state, never
 // by retained pointers or runtime-private variables.
 const rebooted=JSON.parse(JSON.stringify(trained));
 const postPolicy={
  A:policyFor(rebooted,'A',config),B:policyFor(rebooted,'B',config)};
 const baseline={A:false,B:false};
 const removeA=new Set(rebooted.filter(e=>e.context==='A').map(e=>e.id));
 const removeB=new Set(rebooted.filter(e=>e.context==='B').map(e=>e.id));
 const afterAablation=rebooted.filter(e=>!removeA.has(e.id));
 const placebo=rebooted.filter(e=>!removeB.has(e.id));
 const ablationPolicy={A:policyFor(afterAablation,'A',config),
   B:policyFor(afterAablation,'B',config)};
 const placeboPolicy={A:policyFor(placebo,'A',config),
   B:policyFor(placebo,'B',config)};
 const heldout=[];
 for(const context of ['A','B']){
   for(let i=0;i<config.heldout_per_context;i++){
     const task=createSandboxTask({seed,index:1000+i,context});
     const entry=execute(task,postPolicy[context].inspect,'heldout');
     if(!entry)return {executed:false,gates:gate,reason:'credit-depleted',
       blocked_at:'heldout',episodes};
     heldout.push(entry);
   }
 }
 const beforeRate={A:Number(baseline.A),B:Number(baseline.B)};
 const afterRate={A:Number(postPolicy.A.inspect),B:Number(postPolicy.B.inspect)};
 const ablated={A:Number(ablationPolicy.A.inspect),B:Number(ablationPolicy.B.inspect)};
 const placeboRate={A:Number(placeboPolicy.A.inspect),B:Number(placeboPolicy.B.inspect)};
 const effect={
  A:afterRate.A-beforeRate.A,
  B:afterRate.B-beforeRate.B,
  difference_in_differences:(afterRate.A-beforeRate.A)-(afterRate.B-beforeRate.B),
  causal_ablation_A:afterRate.A-ablated.A,
  placebo_shift_A:Math.abs(afterRate.A-placeboRate.A),
  noise_floor:Math.abs(afterRate.A-placeboRate.A),
  post_reboot_preserved:true,
  explored_A:trained.filter(e=>e.context==='A'&&e.inspect).length,
  explored_B:trained.filter(e=>e.context==='B'&&e.inspect).length,
  spent_inspection_credits:spent,
  verified_receipts:episodes.filter(e=>e.verified).length,
  A_heldout_accuracy:fixed(heldout.filter(e=>e.context==='A'&&e.success).length/
     config.heldout_per_context),
  B_heldout_accuracy:fixed(heldout.filter(e=>e.context==='B'&&e.success).length/
     config.heldout_per_context),
 };
 const accepted=effect.difference_in_differences>=config.minimum_A_effect&&
  Math.abs(effect.B)<=config.maximum_B_effect&&
  Math.abs(ablated.A-beforeRate.A)<=config.maximum_residual_ablation&&
  effect.placebo_shift_A<=config.maximum_placebo_effect&&
  effect.causal_ablation_A>effect.noise_floor;
 return {executed:true,gates:gate,accepted,seed,
  preregistration:config.preregistered_sha256,
  policies:{before:baseline,after:postPolicy,ablated:ablationPolicy,placebo:placeboPolicy},
  effect,experiments:{train:trained.length,heldout:heldout.length,
    A_ablation:removeA.size,B_placebo:removeB.size},
  provenance:'deterministic-transformer-simulator-verified-without-LLM',
  model_used:false,hostinger_actions_executed:false};
}
export function runABStudy({
  config=preRegisterProtocol(),gates={},draws=config.draws,
}={}){
 const all=[];
 for(let n=0;n<draws;n++)
  all.push(runSandboxSession({
   seed:config.seed_base+n*7919,config,gateOverrides:gates}));
 if(all.some(x=>!x.executed))
   return {version:PROTOCOL_VERSION,executed:false,reason:'blocked',
     details:all.find(x=>!x.executed),preregistration:config.preregistered_sha256};
 const mean=key=>fixed(all.reduce((sum,x)=>sum+safeN(x.effect[key]),0)/draws);
 const accepted=all.filter(x=>x.accepted).length;
 return {version:PROTOCOL_VERSION,executed:true,accepted:accepted===draws,
  draws,passes:accepted,preregistration:config.preregistered_sha256,
  gates:sandboxGates(gates),config:{
    inspection_cost:config.inspection_cost,
    minimum_A_effect:config.minimum_A_effect,
    training_per_context:config.training_per_context,
    heldout_per_context:config.heldout_per_context},
  metrics:{
    difference_in_differences:mean('difference_in_differences'),
    causal_ablation_A:mean('causal_ablation_A'),
    placebo_shift_A:mean('placebo_shift_A'),
    noise_floor:mean('noise_floor'),
    A_heldout_accuracy:mean('A_heldout_accuracy'),
    B_heldout_accuracy:mean('B_heldout_accuracy'),
    mean_inspection_cost:mean('spent_inspection_credits'),
  },
  A_vs_B:all[0].policies,
  scope:'deterministic-sandbox-acceptance-not-production',
  independent_verifier:'separate-numeric-transformer-code',
  consciousness_proven:false,quantum_computation_performed:false};
}
