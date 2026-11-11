import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalTarget,verifyTransformer} from '../src/sandbox_transformer_verifier.js';
import {preRegisterProtocol,sandboxGates,runSandboxSession,
 runABStudy,createSandboxTask} from '../src/p0_ab_sandbox.js';
import {createDigitalGenome,expressDigitalGenome,mutateDigitalGenome,
 recombineDigitalGenomes,studyDigitalGenome,classicalBoltzmannSelection,
 evolveDigitalGenome} from '../src/digital_protogenome.js';
const config=preRegisterProtocol({draws:16});
test('G1-G5 block entire protocol before a single tool when one gate fails',()=>{
 for(const key of ['G1','G2','G3','G4','G5']){
  const failed=runSandboxSession({config,gateOverrides:{[key]:false}});
  assert.equal(failed.executed,false);
  assert.equal(failed.episodes.length,0);
  assert.deepEqual(failed.gates.blocked,[key]);
  assert.equal(failed.blocked_at,'before-first-tool');
 }
 assert.equal(sandboxGates().passed,true);
 assert.equal(sandboxGates().production_controls_not_certified,true);
});
test('A/B preregistration has immutable checksum, exact cost and fixed thresholds',()=>{
 assert.equal(config.inspection_cost,1);
 assert.equal(config.minimum_A_effect,.4);
 assert.equal(config.hazard_probability_A,.7);
 assert.equal(config.hazard_probability_B,0);
 assert.match(config.preregistered_sha256,/^[a-f0-9]{64}$/);
 assert.equal(config.preregistered_sha256,preRegisterProtocol({draws:16}).preregistered_sha256);
 assert.throws(()=>preRegisterProtocol({inspection_cost:2}),/invalid/);
 assert.throws(()=>preRegisterProtocol({draws:100000}),/invalid/);
});
test('independent verifier catches a plausible false tool success',()=>{
 const task={id:'case',context:'A',input:7};
 assert.equal(canonicalTarget(task),28);
 const falseClaim=verifyTransformer({task,result:{value:27,
  inspected:false,claimed_success:true}});
 assert.equal(falseClaim.success,false);
 assert.equal(falseClaim.exit_code,1);
 assert.equal(falseClaim.model_used,false);
 const repaired=verifyTransformer({task,result:{value:28,inspected:true}});
 assert.equal(repaired.success,true);
 assert.equal(repaired.cost,1);
 assert.equal(repaired.exit_code,0);
 assert.notEqual(falseClaim.receipt,repaired.receipt);
});
test('one session: A learns costly preflight, B stays direct; reboot/placebo/ablation',()=>{
 const session=runSandboxSession({seed:104729,config});
 assert.equal(session.executed,true);
 assert.equal(session.accepted,true);
 assert.equal(session.policies.before.A,false);
 assert.equal(session.policies.before.B,false);
 assert.equal(session.policies.after.A.inspect,true);
 assert.equal(session.policies.after.B.inspect,false);
 assert.equal(session.policies.ablated.A.inspect,false);
 assert.equal(session.policies.placebo.A.inspect,true);
 assert.equal(session.effect.causal_ablation_A,1);
 assert.equal(session.effect.placebo_shift_A,0);
 assert.equal(session.effect.noise_floor,0);
 assert.equal(session.effect.post_reboot_preserved,true);
 assert.equal(session.effect.A_heldout_accuracy,1);
 assert.equal(session.effect.B_heldout_accuracy,1);
 assert.ok(session.effect.verified_receipts>=
  config.training_per_context*2+config.heldout_per_context*2);
});
test('64 held-out seeded experiments: effect size >.4, placebo <.1, noise floor 0',()=>{
 const report=runABStudy({config:preRegisterProtocol({draws:64})});
 assert.equal(report.executed,true);
 assert.equal(report.passes,64);
 assert.equal(report.accepted,true);
 assert.ok(report.metrics.difference_in_differences>=.4);
 assert.ok(report.metrics.causal_ablation_A>=.4);
 assert.ok(report.metrics.placebo_shift_A<=.1);
 assert.equal(report.metrics.noise_floor,0);
 assert.equal(report.metrics.B_heldout_accuracy,1);
 assert.equal(report.consciousness_proven,false);
 assert.equal(report.scope,'deterministic-sandbox-acceptance-not-production');
});
test('task contexts are randomised by stable seed, but verifier remains deterministic',()=>{
 const a=createSandboxTask({seed:7,index:31,context:'A'});
 const b=createSandboxTask({seed:7,index:31,context:'B'});
 assert.deepEqual(createSandboxTask({seed:7,index:31,context:'A'}),a);
 assert.notEqual(a.id,b.id);
 assert.equal(b.hazard,false);
});
test('digital genotype has checksum, interpretable expression and bounded mutations',()=>{
 const origin=createDigitalGenome({seed:'AURA'});
 const traits=expressDigitalGenome(origin).traits;
 assert.equal(origin.dna.length,48);
 assert.match(origin.dna,/^[ACGT]+$/);
 assert.ok(traits.homeostasis_recovery>=.001);
 assert.ok(traits.exploration_period>=3&&traits.exploration_period<=10);
 const changed=mutateDigitalGenome(origin,{seed:'test',sites:3});
 assert.equal(changed.edits.length,3);
 assert.notEqual(changed.child.id,origin.id);
 assert.equal(changed.child.parent_ids[0],origin.id);
 assert.equal(changed.child.generation,origin.generation+1);
 assert.throws(()=>expressDigitalGenome({...origin,dna:origin.dna.slice(1)+'A'}),/integrity/);
 const child=recombineDigitalGenomes(origin,changed.child,{seed:'cross'});
 assert.equal(child.dna.length,48);
 assert.equal(child.parent_ids.length,2);
 assert.equal(expressDigitalGenome(child).quantum_process_used,false);
});
test('genetic sandbox search does not rewrite production and independent validation uses separate seeds',()=>{
 const initial=createDigitalGenome({seed:'fixed'});
 const examined=studyDigitalGenome(initial,{draws:4});
 assert.ok(Number.isFinite(examined.fitness));
 assert.match(examined.protocol_sha256,/^[0-9a-f]{64}$/);
 const softmax=classicalBoltzmannSelection([
  {fitness:1,id:'low'},{fitness:3,id:'high'}],{seed:'choice'});
 assert.equal(softmax.quantum_hardware_used,false);
 assert.equal(softmax.method,'classical-softmax-temperature');
 const run=evolveDigitalGenome({seed:'CI-20261111',generations:2,population:4});
 assert.equal(run.production_adoption,'NOT_AUTHORIZED');
 assert.equal(run.autoselfrewrite,false);
 assert.equal(run.sandbox_only,true);
 assert.equal(run.history.length,2);
 assert.equal(run.independentValidation.study_draws,24);
 assert.equal(run.classical_not_quantum,true);
});
test('production code must not expose sandbox simulation as independently verified live AURA cognition',()=>{
 const src=readFileSync(new URL('../src/p0_ab_sandbox.js',import.meta.url),'utf8');
 assert.match(src,/hostinger_actions_executed:false/);
 assert.match(src,/production_controls_not_certified:true/);
 const genome=readFileSync(new URL('../src/digital_protogenome.js',import.meta.url),'utf8');
 assert.match(genome,/production_adoption:'NOT_AUTHORIZED'/);
 assert.doesNotMatch(genome,/eval\(|new Function\(/);
});
