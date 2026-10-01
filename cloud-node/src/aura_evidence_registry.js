export const AURA_EVIDENCE_BASELINE = Object.freeze({
  version: 'aura-v8.3-evidence-v1',
  base_revision: 'b904a67d18650b768a1ebf21eaa0299fce199b67',
  visual_baseline: 'AURA V8.3 Continuity Live Signals',
  agi_claim: 'NOT_DEMONSTRATED',
  gpt_equivalence_claim: 'NOT_MEASURED',
  energy_reduction_claim: 'NOT_MEASURED',
});

const VALID_STATES = new Set(['ACTIVE','DEGRADED','DISABLED','MISSING']);

function cap(id,label,category,state,summary,extra={}){
  if(!VALID_STATES.has(state)) throw new Error(`Invalid AURA capability state: ${state}`);
  return {id,label,category,state,summary,...extra};
}

function enabledState(enabled, active){
  if(!enabled)return 'DISABLED';
  return active?'ACTIVE':'DEGRADED';
}

export function buildAuraEvidenceRegistry(snapshot={}){
  const runtimeReady=Boolean(snapshot.runtime_ready);
  const dbReady=Boolean(snapshot.db_ready);
  const workerOnline=Boolean(snapshot.worker_online);
  const aiEnabled=Boolean(snapshot.ai_enabled);
  const command=snapshot.command_center||{};
  const curiosity=snapshot.curiosity||{};
  const horizon=snapshot.horizon||{};
  const fabric=snapshot.fabric||{};
  const web=snapshot.web_substrate||{};
  const workerActions=new Set(Array.isArray(snapshot.worker_actions)?snapshot.worker_actions.map(String):[]);

  const browserAction=[...workerActions].some(name=>/browser|navigate|web\.open|web\.click/i.test(name));
  const computerAction=[...workerActions].some(name=>/computer|desktop|mouse|keyboard/i.test(name));

  const capabilities=[
    cap('native_cognition','Cognition native','cognition',runtimeReady?'ACTIVE':'DEGRADED',
      'Le noyau de cognition natif reste distinct du modèle de langage.',
      {evidence:['CognitiveKernel','CognitionEngine'],required_for_core:true}),
    cap('persistent_memory','Mémoire persistante','memory',dbReady?'ACTIVE':'DEGRADED',
      'Intentions, leçons, traces, messages, résultats et état du noyau sont persistés lorsque MySQL est disponible.',
      {required_for_core:true}),
    cap('operational_continuity','Continuité opérationnelle','memory',(runtimeReady&&dbReady)?'ACTIVE':'DEGRADED',
      'V8.3 récupère explicitement les échanges opérationnels, échecs, intentions, initiatives et traces récentes.',
      {evidence:['continuitySnapshot()','recall_operational_continuity'],required_for_core:true}),
    cap('live_cognitive_signals','Signaux cognitifs live','observability',runtimeReady?'ACTIVE':'DEGRADED',
      'Les impulsions visuelles sont alimentées par des transitions fonctionnelles réelles du noyau, interrogées chaque seconde.',
      {evidence:['emitNeuralSignal()','/api/kernel/public/neural-signals'],required_for_core:false}),
    cap('language_support','Support sémantique / verbalisation','language',aiEnabled?'ACTIVE':'DEGRADED',
      'Le modèle de langage sert de support sémantique et de verbalisation; la décision native ne doit pas en dépendre.',
      {required_for_core:false}),
    cap('curiosity','Curiosité autonome','agency',enabledState(Boolean(curiosity.enabled),Boolean(curiosity.started||curiosity.running)),
      'Le moteur de curiosité peut générer et poursuivre des questions lorsque la fonction est activée.',
      {required_for_core:false}),
    cap('command_center','Centre de commande','agency',enabledState(Boolean(command.enabled),Boolean(command.started||command.running)),
      'Le centre de commande suit et poursuit des initiatives bornées.',
      {required_for_core:false}),
    cap('horizon','HORIZON','perception',enabledState(Boolean(horizon.enabled),Boolean(horizon.started||horizon.last_success_at)),
      'HORIZON fournit une perception externe avec garde épistémique lorsqu’il est configuré.',
      {required_for_core:false}),
    cap('web_substrate','Substrat Web','perception',enabledState(Boolean(web.enabled),Boolean(web.ready||web.started||web.available)),
      'Le substrat Web apporte recherche et collecte d’éléments externes lorsque le fournisseur configuré répond.',
      {required_for_core:false}),
    cap('capability_fabric','Capability Fabric','integration',enabledState(Boolean(fabric.enabled),Boolean(fabric.started)),
      'Le fabric recense et route les capacités disponibles.',
      {required_for_core:false}),
    cap('local_worker','Exécutant local','action',workerOnline?'ACTIVE':'DISABLED',
      workerOnline?'Un worker local est actuellement connecté.':'Le worker local est hors ligne; il n’est pas une priorité ni un bloqueur global du noyau Cloud.',
      {required_for_core:false,global_blocker:false}),
    cap('browser_operator','Opérateur navigateur réel','action',browserAction?'ACTIVE':'MISSING',
      browserAction?'Une capacité de contrôle navigateur est annoncée par le worker actif.':'Aucune capacité de contrôle navigateur réel n’est attestée dans le snapshot courant.',
      {required_for_core:false}),
    cap('computer_operator','Opérateur ordinateur graphique','action',computerAction?'ACTIVE':'MISSING',
      computerAction?'Une capacité de contrôle ordinateur est annoncée par le worker actif.':'Aucune capacité de contrôle graphique complet n’est attestée.',
      {required_for_core:false}),
    cap('aura_eval','AURA-Eval aveugle','verification','ACTIVE',
      'Le protocole de 50 missions aveugles est versionné; les instances concrètes restent externes au dépôt.',
      {evidence:['evaluation/aura-eval-manifest.json','evaluation/aura-eval.mjs']}),
    cap('agi_evidence','Preuve AGI','verification','MISSING',
      'Aucune conclusion AGI n’est autorisée avant exécution répétée des missions aveugles sous nouveauté, perturbation, panne, contradiction, mémoire et transfert.',
      {claim_allowed:false}),
    cap('gpt_equivalence','Équivalence GPT','verification','MISSING',
      'Aucun niveau GPT équivalent n’est attribué sans comparaison sur les mêmes missions et permissions d’outils.',
      {claim_allowed:false}),
    cap('energy_telemetry','Télémétrie énergétique bout-en-bout','efficiency','MISSING',
      'Les joules distants ne sont pas connus; aucune réduction de 50% ne peut être revendiquée sans mesure cohérente de même périmètre.',
      {claim_allowed:false}),
  ];

  const counts={ACTIVE:0,DEGRADED:0,DISABLED:0,MISSING:0};
  for(const item of capabilities)counts[item.state]+=1;

  return {
    ...AURA_EVIDENCE_BASELINE,
    generated_at:new Date().toISOString(),
    truth_policy:'architecture is evidence of implementation, not proof of general intelligence',
    summary:{
      total:capabilities.length,
      active:counts.ACTIVE,
      degraded:counts.DEGRADED,
      disabled:counts.DISABLED,
      missing:counts.MISSING,
    },
    capabilities,
  };
}
