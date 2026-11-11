import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceInput,competeInWorkspace} from '../src/global_workspace.js';
import {receptorAblation} from '../src/workspace_receptors.js';
import {selectedMemoryRefs} from '../src/workspace_boundary.js';
const now=Date.parse('2026-11-11T15:00:00Z'),at=new Date(now).toISOString();

test('recipient transformations are typed and muting insula/prefrontal changes control',()=>{
 const candidates=workspaceInput({userPresent:true,nowMs:now,
  organism:{homeostasis:{sensor:{source:'node-process',
   sampled_at:at,compute_pressure:1}}},
  metacognition:{verify:true},
 });
 const full=competeInWorkspace(candidates,{nowMs:now});
 const withoutInsula=competeInWorkspace(candidates,{
  nowMs:now,mutedRecipients:['insula']});
 const withoutPrefrontal=competeInWorkspace(candidates,{
  nowMs:now,mutedRecipients:['prefrontal']});
 assert.equal(full.decision.verification_required,true);
 assert.equal(full.decision.optional_compute_deferred,true);
 assert.equal(withoutInsula.decision.optional_compute_deferred,false);
 assert.equal(withoutPrefrontal.decision.verification_required,false);
 assert.equal(withoutPrefrontal.decision.attention,'none');
 assert.equal(full.processed.prefrontal.kind,'executive-control');
 assert.equal(full.processed.insula.kind,'resource-interoception');
 assert.equal(full.processed.hippocampus.kind,'memory-reference-selection');
 assert.equal(full.processed.basal_ganglia.kind,'policy-selection');
 assert.equal(full.processed.metacognition.kind,'uncertainty-monitoring');
 const proof=receptorAblation(full.received);
 assert.equal(proof.insula_causal,true);
 assert.equal(proof.prefrontal_causal,true);
});

test('hippocampus ablation removes exact memory refs without changing raw candidates',()=>{
 const candidates=workspaceInput({userPresent:true,nowMs:now,
  memoryProposals:[{ref:'note:42',salience:.9}],
 });
 const full=competeInWorkspace(candidates,{nowMs:now});
 const noHipp=competeInWorkspace(candidates,{
  nowMs:now,mutedRecipients:['hippocampus']});
 assert.deepEqual([...selectedMemoryRefs(full)],['note:42']);
 assert.deepEqual([...selectedMemoryRefs(noHipp)],[]);
 assert.equal(receptorAblation(full.received).memory_causal,true);
 assert.deepEqual(full.selected,noHipp.selected,
  'Ablation must remove the recipient, not the original candidate');
});
