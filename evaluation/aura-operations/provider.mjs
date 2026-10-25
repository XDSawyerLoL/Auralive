import { classifyInitiativeResult } from '../../cloud-node/src/outcome_truth.js';
import { cases } from './fixtures.mjs';

export default class AuraLocalEvidenceProvider {
  id() { return 'aura:local-evidence'; }
  async callApi(prompt) {
    const key = String(prompt || '').trim();
    const test = cases.find(item => item.id === key);
    if (!test) return { error: `unknown local fixture: ${key}` };
    const result = classifyInitiativeResult(test.kind, test.result);
    return { output: result.status };
  }
}
