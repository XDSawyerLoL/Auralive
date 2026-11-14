// Text-only, zero-API-cost emergency dialogue while MySQL is unavailable.
// Not the persistent AURA nucleus: no autobiographical learning or tools.
const LOCAL_SYSTEM_PROMPT = [
  'Tu es AURA. Réponds directement en français naturel à la demande.',
  'Tu fonctionnes en mode local temporaire, sans accès aux souvenirs personnels ni aux outils.',
  'Ne prétends pas avoir mémorisé cet échange ou exécuté une action.',
  'Exprime ton incertitude plutôt que d’inventer des faits.',
].join(' ');

export async function generateStandaloneLocalReply({localOnly=false,runtime,text=''}) {
  if(!localOnly || !runtime || typeof runtime.generate!=='function') return null;
  const status=runtime.status?.()||{};
  const ready=status.ready===true && status.probe_verified===true;
  if(!ready){
    return {ok:false,answer:'',response_kind:'model-unavailable',
      language_unavailable:true,retryable:true,memory_persisted:false,
      service_status:{code:'french-inference-unavailable',
        message:'Le modèle local n’a pas confirmé sa capacité à produire du texte.'}};
  }
  let answer='';
  try{answer=String(await runtime.generate(String(text).trim().slice(0,3800),LOCAL_SYSTEM_PROMPT,180)||'').trim();}
  catch{answer='';}
  return {
    ok:Boolean(answer),answer,
    response_kind:answer?'local-ephemeral':'model-unavailable',
    language_provider:'aura-local-embedded',
    language_unavailable:!answer,retryable:!answer,
    memory_persisted:false,tools_executed:false,
    nucleus_verbalization_validated:false,
    voice_ticket:'',
    service_status:answer?null:{code:'french-inference-unavailable',
      message:'Le moteur local a échoué à générer une réponse. Aucun texte fabriqué.'},
  };
}
