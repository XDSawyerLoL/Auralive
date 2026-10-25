// Real filesystem action through the existing AURA Cloud operator, not a mock.
// Runs locally without external AI, GitHub Actions, VPS or an active MySQL DB.
import { CognitiveKernel } from '../src/kernel.js';
import { CapabilityFabric } from '../src/capability_fabric.js';

const fabric = new CapabilityFabric();
const kernel = new CognitiveKernel(
  { enabled: false, async generate() { return ''; } },
  null,
  { enabled: false, async workerOnline() { return false; } },
  null,
  fabric,
);
// This experiment does not use production persistent logs.
kernel.trace = async () => {};
kernel.runAgent = async () => ({ agent: 'operator', answer: 'Aucun agent distant disponible.' });
const goal = 'Créer un fichier de test, relire son contenu, puis le supprimer.';

try {
  const result = await kernel.operate(goal, ['safe']);
  const proof = result.verification || {};
  const valid = result.ok === true
    && result.executed === true
    && result.execution_mode === 'aura-cloud-sandbox'
    && proof.verified === true
    && proof.deleted === true
    && /^[0-9a-f]{64}$/.test(String(proof.sha256 || ''))
    && result.result?.metrics?.nodes_completed === 3
    && Number(result.result?.metrics?.cost_microunits || 0) === 0;
  console.log(JSON.stringify({
    ok: valid,
    operation: 'create-read-sha256-verify-delete',
    execution_mode: result.execution_mode,
    verified: proof.verified === true,
    deleted: proof.deleted === true,
    sha256: proof.sha256 || '',
    nodes_completed: Number(result.result?.metrics?.nodes_completed || 0),
    cost_microunits: Number(result.result?.metrics?.cost_microunits || 0),
    error: result.verification?.reason || '',
  }, null, 2));
  if (!valid) process.exitCode = 1;
} catch (error) {
  console.error('Action réelle AURA non vérifiée:', String(error?.message || error));
  process.exitCode = 1;
}
