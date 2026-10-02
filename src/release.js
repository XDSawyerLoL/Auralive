export const AURA_RELEASE = Object.freeze({
  id: 'AURA-HOSTINGER-V9.3-CLOUD-FIRST',
  generation: 'v9.3',
  channel: 'hostinger/aura-cloud',
  source_baseline: 'a88eb347b931d9b3ee8bd634c34481c16bed10c8',
  execution_policy: 'cloud-first-local-optional',
  final_language_authority: 'AURA native cognition',
  packaged_at: '2026-10-02',
});

export function releaseInfo() {
  return { ...AURA_RELEASE };
}
