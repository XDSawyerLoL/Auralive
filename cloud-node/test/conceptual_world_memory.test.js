import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialConceptMemory,addConceptRelation,retractConceptSource,
 inspectConceptMemory,proposeCrossDomainRelation,conceptTransferAblation,
 observeMachineVerifiedConcept} from '../src/conceptual_world_memory.js';
import {publicSoul} from '../src/policy.js';
import {CognitiveKernel} from '../src/kernel.js';

const when='2026-11-14T15:00:00.000Z';
const relation=(state,{sourceId='record-1',domain='logistique',
  predicate='avant',polarity='positive',subject='contrôler le colis',
  object='expédier le colis',subjectKind='verification',
  objectKind='execution',timeScope='episode_1',kind='user-report'}={})=>
 addConceptRelation(state,{
  domain,subject:{label:subject,kind:subjectKind},
  relation:predicate,object:{label:object,kind:objectKind},
  polarity,timeScope,
  evidence:{source_id:sourceId,kind,observed_at:when}
 });

test('an open vocabulary concept graph learns novel kinds, labels, relations, and persists after restart',()=>{
 const before=initialConceptMemory();
 const a=relation(before,{predicate:'rend_possible',domain:'marine',
  subject:'analyser la marée',object:'planifier une traversée',
  subjectKind:'analyse_oceanographique',objectKind:'navigation'});
 assert.equal(a.accepted,true);
 assert.equal(a.status,'user-reported');
 assert.equal(a.state.nodes.length,2);
 assert.equal(a.state.links.length,1);
 assert.equal(before.links.length,0,'pure immutable update');
 const restored=JSON.parse(JSON.stringify(a.state));
 const inspected=inspectConceptMemory(restored,{domain:'marine'});
 assert.equal(inspected.revision,1);
 assert.equal(inspected.visible[0].relation,'rend_possible');
 assert.equal(inspected.visible[0].status,'user-reported');
 assert.equal(inspected.verified_world_facts,0);
});

test('two identical messages do not multiply evidence or confidence',()=>{
 const a=relation(initialConceptMemory(),{sourceId:'chat-1'});
 const dup=relation(a.state,{sourceId:'chat-1'});
 assert.equal(dup.accepted,false);
 assert.equal(dup.reason,'repeated-evidence-id');
 assert.deepEqual(dup.state,a.state);
});

test('different sources may be retracted without erasing revisions or unrelated proofs',()=>{
 const a=relation(initialConceptMemory(),{sourceId:'chat-1'});
 const b=relation(a.state,{sourceId:'chat-2'});
 assert.equal(b.accepted,true);
 const c=retractConceptSource(b.state,{sourceId:'chat-1',
  at:'2026-11-14T15:05:00.000Z'});
 assert.equal(c.changed,true);
 assert.equal(inspectConceptMemory(c.state).visible[0].active_sources.length,1);
 assert.equal(inspectConceptMemory(c.state).visible[0].status,'user-reported');
 const d=retractConceptSource(c.state,{sourceId:'chat-2',
  at:'2026-11-14T15:06:00.000Z'});
 assert.equal(inspectConceptMemory(d.state).visible[0].status,'retracted');
 assert.deepEqual(d.state.revisions.map(x=>x.operation),
  ['observe','observe','retract','retract']);
 assert.equal(d.state.revision,4);
});

test('contradictory reports remain visible, do not overwrite each other',()=>{
 const positive=relation(initialConceptMemory(),{sourceId:'claim-yes',
  subject:'bâche',subjectKind:'objet',object:'entrepôt',
  objectKind:'lieu',predicate:'located_in',timeScope:'14_nov'});
 const negative=relation(positive.state,{sourceId:'claim-no',
  subject:'bâche',subjectKind:'objet',object:'entrepôt',
  objectKind:'lieu',predicate:'located_in',timeScope:'14_nov',
  polarity:'negative'});
 assert.equal(negative.accepted,true);
 const graph=inspectConceptMemory(negative.state);
 assert.equal(graph.visible.length,2);
 assert.equal(graph.visible[0].conflicting_link_ids.length,1);
 assert.equal(graph.visible[1].conflicting_link_ids.length,1);
 assert.equal(graph.verified_world_facts,0);
 const later=relation(negative.state,{sourceId:'later-state',
  subject:'bâche',subjectKind:'objet',object:'bureau',objectKind:'lieu',
  predicate:'located_in',timeScope:'15_nov'});
 assert.equal(inspectConceptMemory(later.state).visible.at(-1)
  .conflicting_link_ids.length,0,'do not assert simultaneous contradiction across times');
});

test('unverified reports cannot mint machine verification by supplying fabricated keys',()=>{
 const forged=addConceptRelation(initialConceptMemory(),{
  domain:'logistique',subject:{label:'sonde',kind:'action'},
  relation:'observed_result',object:{label:'succès',kind:'outcome'},
  evidence:{kind:'machine-verified',source_id:'machine:10',observed_at:when,
   episode_id:10,validated_receipt:true,proof_hash:'a'.repeat(64)}
 });
 assert.equal(forged.accepted,false);
 assert.equal(forged.state.links.length,0);
 const noProof=observeMachineVerifiedConcept(initialConceptMemory(),{
  world:{episodes:[]},episodeId:10,runId:'run10',proofHash:'a'.repeat(64),
  context:'maintenance',success:true,observedAt:when
 });
 assert.equal(noProof.accepted,false);
 const world={episodes:[{episode_id:10,run_id:'run10',proof_hash:'a'.repeat(64),
  context:'maintenance',success:1,observed_at:when}]};
 const good=observeMachineVerifiedConcept(initialConceptMemory(),{
  world,episodeId:10,runId:'run10',proofHash:'a'.repeat(64),
  context:'maintenance',success:true,observedAt:when
 });
 assert.equal(good.accepted,true);
 assert.equal(good.status,'machine-observed');
 assert.equal(inspectConceptMemory(good.state).verified_world_facts,1);
 const retract=retractConceptSource(good.state,{
  sourceId:'machine:10',at:'2026-11-14T16:00:00.000Z'});
 assert.equal(retract.changed,false,'owner cannot revoke machine receipt via user route');
});

const target={targetDomain:'administration',
 subject:{label:'vérifier le dossier',kind:'verification'},
 object:{label:'déposer le dossier',kind:'execution'}};
function trainedGraph(){
 let graph=initialConceptMemory();
 for(const row of [
  {sourceId:'obs-marine-1',domain:'marine',subject:'contrôler le vent',
   object:'lever les voiles',timeScope:'s1'},
  {sourceId:'obs-montage-2',domain:'montage',subject:'vérifier la fixation',
   object:'mettre la machine en route',timeScope:'s2'},
 ]){
  const r=relation(graph,row);assert.equal(r.accepted,true);graph=r.state;
 }
 return graph;
}
test('two independently sourced relational motifs transfer to an entirely new domain as HYPOTHESIS only',()=>{
 const graph=trainedGraph();
 const out=proposeCrossDomainRelation(graph,target);
 assert.equal(out.transferred,true);
 assert.equal(out.status,'testable-hypothesis');
 assert.equal(out.relation,'avant');
 assert.deepEqual(out.source_domains,['marine','montage']);
 assert.equal(out.independent_sources,2);
 assert.equal(out.verified_target_facts,0);
 assert.equal(out.next_action,'seek-independent-observation-not-execute');
 const afterRestart=JSON.parse(JSON.stringify(graph));
 assert.deepEqual(proposeCrossDomainRelation(afterRestart,target),out);
 const ablation=conceptTransferAblation(graph,target);
 assert.equal(ablation.transfer_depends_on_evidence,true);
 assert.equal(ablation.without_sources.transferred,false);
});

test('contradictions, a single source, or source retraction cancel the transfer',()=>{
 let graph=trainedGraph();
 const conflicted=relation(graph,{
  sourceId:'contradiction-1',domain:'maritime',predicate:'avant',
  polarity:'negative',subject:'vérifier les amarres',
  object:'partir',timeScope:'s3'
 });
 assert.equal(conflicted.accepted,true);
 assert.equal(proposeCrossDomainRelation(conflicted.state,target).transferred,false);
 const single=proposeCrossDomainRelation(graph,{
  ...target,excludeSourceIds:['obs-montage-2']});
 assert.equal(single.transferred,false);
 const retract=retractConceptSource(graph,{
  sourceId:'obs-marine-1',at:'2026-11-14T15:10:00.000Z'});
 assert.equal(proposeCrossDomainRelation(retract.state,target).transferred,false);
});

test('a target domain with existing source episodes is excluded from training for that target',()=>{
 const graph=trainedGraph();
 const inSource=proposeCrossDomainRelation(graph,{...target,targetDomain:'marine'});
 assert.equal(inSource.transferred,false);
 assert.equal(inSource.reason,'no-diverse-uncontradicted-source-pattern');
});

test('private conceptual data and entity labels cannot leak through public soul',()=>{
 const state=trainedGraph();
 const safe=publicSoul({name:'AURA',concept_memory:state,
  current_intention:'privé',dominant_thought:'autre privé'});
 assert.equal(safe.name,'AURA');
 assert.equal(safe.concept_memory,undefined);
 assert.equal(JSON.stringify(safe).includes('contrôler le vent'),false);
 const kernel=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(kernel,/concept_memory:initialConceptMemory\(\)/);
 assert.match(kernel,/observeMachineVerifiedConcept\(/);
 assert.match(kernel,/rememberFrenchEventLinks\(content/);
 assert.match(server,/requirePrivate\(request,reply\)/);
 assert.match(server,/automatic_execution:false/);
});

test('bounded state refuses more concepts rather than silently forgetting old evidence',()=>{
 let state=initialConceptMemory();
 for(let i=0;i<370;i++){
  const r=relation(state,{sourceId:'id-'+i,domain:'domain_'+i,
   subject:'objet '+i,object:'résultat '+i});
  if(!r.accepted){
   assert.equal(r.reason,'bounded-memory-capacity-reached');
   return;
  }
  state=r.state;
 }
 assert.fail('must enforce bounded memory before 370 unique relations');
});


test('private dialogue actually retains native event chronology across restart',async()=>{
 const fake={soulCache:{concept_memory:initialConceptMemory()},
  async saveSoul(){this.persisted=JSON.parse(JSON.stringify(this.soulCache.concept_memory));}};
 const result=await CognitiveKernel.prototype.rememberFrenchEventLinks.call(fake,
  'Maya a ouvert le coffre une fois que Hugo a fermé la porte.',
  {sourceId:'chat-turn-90',domain:'private_dialogue'});
 assert.equal(result.accepted,true);
 assert.equal(result.verified_world_facts,0);
 assert.equal(fake.persisted.links.length,1);
 const inspected=inspectConceptMemory(fake.persisted,{domain:'private_dialogue'});
 assert.equal(inspected.visible[0].relation,'before');
 assert.equal(inspected.visible[0].status,'user-reported');
 assert.equal(inspected.visible[0].subject.kind,'event_fermer');
 assert.equal(inspected.visible[0].object.kind,'event_ouvrir');
});
test('conditional utterances are stored as conditional reports, not realized world history',async()=>{
 const fake={soulCache:{concept_memory:initialConceptMemory()},
  async saveSoul(){return undefined;}};
 const result=await CognitiveKernel.prototype.rememberFrenchEventLinks.call(fake,
  'Si Maya ferme la porte, Hugo ouvre le coffre.',
  {sourceId:'chat-turn-91',domain:'private_dialogue'});
 assert.equal(result.accepted,true);
 const inspected=inspectConceptMemory(fake.soulCache.concept_memory);
 assert.equal(inspected.visible[0].relation,'implies-if');
 assert.equal(inspected.visible[0].status,'user-reported');
 assert.equal(inspected.verified_world_facts,0);
});
test('ordinary past-tense private speech becomes an explicitly unverified event',async()=>{
 const fake={soulCache:{concept_memory:initialConceptMemory()},
  async saveSoul(){return undefined;}};
 const result=await CognitiveKernel.prototype.rememberFrenchEventLinks.call(fake,
  'Romain a fermé la porte.',{sourceId:'chat-turn-92'});
 assert.equal(result.accepted,true);
 const record=inspectConceptMemory(fake.soulCache.concept_memory).visible[0];
 assert.equal(record.relation,'reported_event');
 assert.equal(record.subject.label,'romain');
 assert.equal(record.status,'user-reported');
 assert.equal(record.active_sources[0].kind,'user-report');
});
