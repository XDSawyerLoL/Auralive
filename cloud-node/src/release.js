export const AURA_RELEASE = Object.freeze({
  id: 'AURA-MODERN-V8.3-V9.3-HOSTINGER',
  lineage: 'aura-v8.3-continuity-live-signals',
  hostinger_boot: 'fastify-direct',
  execution_policy: 'cloud-first-local-optional',
  interface_generation: 'cognitive-galaxies-live-signals',
  packaged_at: '2026-10-02',
});

export function releaseInfo() {
  return { ...AURA_RELEASE };
}
