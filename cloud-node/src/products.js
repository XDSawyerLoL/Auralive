export const CORE_QUANTIC_PRODUCTS = Object.freeze([
  {
    id: 'aura',
    name: 'AURA',
    repository: 'XDSawyerLoL/Auralive',
    objective: 'Intelligence commune, mémoire, curiosité, orchestration et évolution de l’écosystème Quantic.',
    criticality: 1,
    capabilities: ['reasoning','memory','curiosity','research','orchestration','evolution','mesh','fabric'],
    aura_bridge: 'native',
  },
  {
    id: 'quantic-studio',
    name: 'Quantic Studio',
    repository: 'XDSawyerLoL/Auralive',
    objective: 'Bras local AURA : modèles, calcul CPU/GPU, image, voix, opérateur et streaming.',
    criticality: 0.96,
    capabilities: ['local-ai','compute','webgpu','image','voice','operator','streaming'],
    aura_bridge: 'native',
  },
  {
    id: 'quantic-glide',
    name: 'Quantic Glide',
    repository: 'XDSawyerLoL/Quantic-Browser',
    objective: 'Perception Web et interface de navigation AURA.',
    criticality: 0.92,
    capabilities: ['browser','web-context','tabs','research-context','downloads'],
    aura_bridge: 'native',
  },
  {
    id: 'quantic-os',
    name: 'Quantic OS',
    repository: 'XDSawyerLoL/QUANTIC-OS',
    objective: 'Couche système et environnement agentique local de Quantic.',
    criticality: 0.94,
    capabilities: ['system','local-control','agents','sandbox','desktop'],
    aura_bridge: 'required',
  },
  {
    id: 'quantic-mail',
    name: 'Quantic Mail',
    repository: 'XDSawyerLoL/QuanticMail',
    objective: 'Communication privée, réseau Quantic et messagerie chiffrée.',
    criticality: 0.9,
    capabilities: ['mail','private-messaging','identity','devices','relay'],
    aura_bridge: 'required',
  },
  {
    id: 'zoon',
    name: 'ZOON',
    repository: 'XDSawyerLoL/QuanticSillage',
    objective: 'Couche sociale Quantic : publications, interactions, médias et flux.',
    criticality: 0.82,
    capabilities: ['social','feed','publishing','media','community'],
    aura_bridge: 'required',
  },
  {
    id: 'pulse',
    name: 'Quantic Pulse',
    repository: 'XDSawyerLoL/QuanticSillage',
    objective: 'Couche sociale historique/compatibilité et flux conversationnels Quantic.',
    criticality: 0.7,
    capabilities: ['social','feed','secure-session'],
    aura_bridge: 'required',
  },
  {
    id: 'quantic-news',
    name: 'Quantic News',
    repository: 'XDSawyerLoL/QuanticSillage',
    objective: 'Veille informationnelle et production de flux d’actualité Quantic.',
    criticality: 0.78,
    capabilities: ['news','rss','monitoring','publishing','sources'],
    aura_bridge: 'required',
  },
  {
    id: 'providence',
    name: 'Providence',
    repository: 'XDSawyerLoL/Human-Agency-Engine',
    objective: 'Analyse profonde, signaux, scénarios, risques et aide à la décision.',
    criticality: 0.88,
    capabilities: ['analysis','signals','risk','scenarios','evidence'],
    aura_bridge: 'required',
  },
  {
    id: 'horizon',
    name: 'HORIZON',
    repository: 'XDSawyerLoL/Human-Agency-Engine',
    objective: 'Perception du monde, signaux externes et chaînes d’impact pour AURA.',
    criticality: 0.86,
    capabilities: ['world-signals','weather','impact-chain','forecast-context'],
    aura_bridge: 'native',
  },
]);

export async function seedQuanticProducts(commandCenter) {
  const results = [];
  for (const product of CORE_QUANTIC_PRODUCTS) {
    const existing = (await commandCenter.services()).find((row) => row.id === product.id);
    const state = existing?.state || (product.id === 'aura' ? 'online' : 'unknown');
    const stateDetail = existing?.state_detail
      || (product.id === 'aura'
        ? 'Noyau AURA actif.'
        : product.aura_bridge === 'native'
          ? 'Pont AURA natif déclaré; observation runtime attendue.'
          : 'Pont AURA universel requis; observation runtime attendue.');
    results.push(await commandCenter.upsertService({
      id: product.id,
      name: product.name,
      kind: 'quantic-product',
      objective: product.objective,
      repository: product.repository,
      criticality: product.criticality,
      enabled: true,
      state,
      state_detail: stateDetail,
      last_observed_at: existing?.last_observed_at || '',
      metadata: {
        ...(existing?.metadata || {}),
        capabilities: product.capabilities,
        aura_bridge: product.aura_bridge,
        writable_by_aura: true,
        modification_policy: 'branch-test-canary-promote',
        ecosystem: 'quantic-sillage',
      },
    }));
  }
  return results;
}
