import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuraEvidenceRegistry, AURA_EVIDENCE_BASELINE } from '../src/aura_evidence_registry.js';

test('V8.3 evidence registry refuses AGI, GPT-equivalence and energy claims by default', () => {
  assert.equal(AURA_EVIDENCE_BASELINE.agi_claim,'NOT_DEMONSTRATED');
  assert.equal(AURA_EVIDENCE_BASELINE.gpt_equivalence_claim,'NOT_MEASURED');
  assert.equal(AURA_EVIDENCE_BASELINE.energy_reduction_claim,'NOT_MEASURED');
});

test('local worker offline is not a global blocker', () => {
  const registry=buildAuraEvidenceRegistry({runtime_ready:true,db_ready:true,worker_online:false,ai_enabled:false});
  const worker=registry.capabilities.find(x=>x.id==='local_worker');
  assert.equal(worker.state,'DISABLED');
  assert.equal(worker.required_for_core,false);
  assert.equal(worker.global_blocker,false);
  assert.equal(registry.capabilities.find(x=>x.id==='native_cognition').state,'ACTIVE');
  assert.equal(registry.capabilities.find(x=>x.id==='operational_continuity').state,'ACTIVE');
});

test('unmeasured claims remain missing even when runtime is healthy', () => {
  const registry=buildAuraEvidenceRegistry({runtime_ready:true,db_ready:true,worker_online:true,ai_enabled:true});
  for(const id of ['agi_evidence','gpt_equivalence','energy_telemetry']){
    assert.equal(registry.capabilities.find(x=>x.id===id).state,'MISSING');
  }
});
