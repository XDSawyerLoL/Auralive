// AURA capability audit: GET-only, no AI calls, no secrets, no CI.
import { pathToFileURL } from 'node:url';
const state = (ok, tested = true) => !tested ? 'non-prouve' : ok ? 'disponible' : 'indisponible';

export function evaluateReadiness({ health = {}, kernel = {}, caps = {}, command = {}, ai = {} } = {}) {
  const agentRuns = Object.values(kernel.agent_runs?.counts || {})
    .reduce((sum, role) => sum + Number(role?.completed || 0), 0);
  const missions = command.long_horizon?.counts || {};
  const completedMissions = Number(missions.completed || 0);
  const machineVerified = Number(kernel.reflex_evidence?.machine_verified || 0);
  const core = Boolean(health.ready && health.db && kernel.started);
  const language = Boolean(caps.language?.ready && kernel.expression?.natural_french_ready);
  const worker = Boolean(command.local_worker_online && caps.hands?.ready);
  return {
    schema: 'aura-capability-readiness-v1',
    measured_at: new Date().toISOString(),
    read_only: true,
    api_cost: 'aucun appel de modèle',
    production_build_verified: Boolean(health.build?.provenance_verified),
    zero_cost_mode_reported: Boolean(ai.zero_cost_mode ?? kernel.bridge?.zero_cost_mode),
    capabilities: {
      noyau: { state: state(core), basis: 'health.ready, MySQL, kernel.started' },
      memoire: { state: state(core && caps.memory?.ready), basis: 'disponibilité, pas qualité du rappel' },
      francais: { state: state(language), basis: 'faculté linguistique vérifiée dans le statut' },
      recherche: { state: state(Boolean(caps.web_substrate?.enabled)), observed_sessions: Number(caps.web_substrate?.total_research || 0) },
      agents: { state: state(agentRuns > 0, agentRuns > 0), recorded_runs: agentRuns },
      missions: { state: state(completedMissions > 0, completedMissions > 0), completed: completedMissions, active: Number(missions.active || 0) },
      actions_machine: { state: state(worker), basis: 'worker en ligne et actions typées déclarées prêtes' },
      verification: { state: state(machineVerified > 0, machineVerified > 0), machine_verified: machineVerified },
      voix: { state: state(Boolean(caps.voice?.ready)) },
      images: { state: state(Boolean(caps.image?.ready)) },
      evolution: { state: state(Boolean(caps.evolution?.ready)) },
    },
    warning: 'Un statut disponible ne prouve pas une bonne réponse, une mission utile ou une AGI.',
  };
}

export async function auditUrl(baseUrl, { fetcher = fetch, timeoutMs = 8000 } = {}) {
  const root = new URL(String(baseUrl));
  if (!['http:', 'https:'].includes(root.protocol)) throw Error('URL HTTP(S) requise');
  const paths = ['/healthz', '/api/kernel/status', '/api/capabilities', '/api/command/status', '/api/ai/runtime'];
  const responses = await Promise.all(paths.map(async path => {
    try {
      const response = await fetcher(new URL(path, root), {
        method: 'GET', headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { path, ok: response.ok, body: response.ok ? await response.json() : {} };
    } catch (error) {
      return { path, ok: false, body: {}, error: String(error?.message || error).slice(0,120) };
    }
  }));
  const records = Object.fromEntries(responses.map(r => [r.path, r]));
  const report = evaluateReadiness({
    health: records['/healthz']?.body,
    kernel: records['/api/kernel/status']?.body,
    caps: records['/api/capabilities']?.body,
    command: records['/api/command/status']?.body,
    ai: records['/api/ai/runtime']?.body,
  });
  report.endpoints = Object.fromEntries(responses.map(r => [r.path, r.ok]));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.argv[2] || process.env.AURA_PUBLIC_BASE_URL;
  if (!url) {
    console.error('Usage: node scripts/audit-aura-readiness.mjs https://votre-serveur-aura');
    process.exitCode = 2;
  } else {
    try {
      const report = await auditUrl(url);
      console.log(JSON.stringify(report, null, 2));
      if (!Object.values(report.endpoints).every(Boolean)) process.exitCode = 1;
    } catch (error) {
      console.error('Audit impossible:', String(error?.message || error));
      process.exitCode = 2;
    }
  }
}
