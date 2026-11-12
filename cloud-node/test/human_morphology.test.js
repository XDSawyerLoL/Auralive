import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSwc,SWC_PROVENANCE_SOURCE } from '../src/human_morphology.js';
// All fixtures below are synthetic, not sourced from a human donor.
const specimenId=643625553;
const tiny=[
  '# synthetic SWC cable',
  '1 1 0 0 0 3 -1',
  '2 3 0 0 10 1 1',
  '3 3 0 0 20 .5 2',
  '4 2 10 0 0 .6 1',
].join('\n');
test('SWC analysis preserves topology and physical dimensions',()=>{
  const x=inspectSwc(tiny,{specimenId});
  assert.equal(x.node_count,4);
  assert.equal(x.segment_count,3);
  assert.equal(x.compartment_type_counts.soma,1);
  assert.equal(x.compartment_type_counts.basal_dendrite,2);
  assert.equal(x.compartment_type_counts.axon,1);
  assert.equal(x.total_cable_length_um,30);
  assert.ok(x.tapered_segment_surface_area_um2>0);
  assert.ok(x.tapered_segment_volume_um3>0);
  assert.equal(x.source,SWC_PROVENANCE_SOURCE);
  assert.match(x.source_hash_sha256,/^[a-f0-9]{64}$/);
  assert.equal(x.source_authenticity_verified_by_server,false);
  assert.equal(x.simulation_enabled,false);
});
test('SWC rejects species spoofing, missing soma and disconnected cycles',()=>{
  assert.throws(()=>inspectSwc(tiny,{specimenId,claimedSpecies:'Mus musculus'}));
  assert.throws(()=>inspectSwc('1 3 0 0 0 3 -1\n2 3 0 0 2 1 1',
    {specimenId}));
  assert.throws(()=>inspectSwc('1 1 0 0 0 3 -1\n2 3 0 0 2 1 3\n3 3 0 0 3 1 2',
    {specimenId}),/cycle/);
});
test('SWC rejects malformed columns, duplicate IDs, absent parent and zero lengths',()=>{
  for(const broken of [
    '1 1 0 0 0 3 -1\n2 3 1 2 3 1',
    '1 1 0 0 0 3 -1\n1 3 0 0 1 1 1',
    '1 1 0 0 0 3 -1\n2 3 0 0 5 1 99',
    '1 1 0 0 0 3 -1\n2 3 0 0 0 1 1',
    '1 1 0 0 0 3 -1\n2 3 NaN 0 1 1 1',
    '1 1 0 0 0 3 -1\n2 3 0 0 1 -1 1',
  ])assert.throws(()=>inspectSwc(broken,{specimenId}));
  assert.throws(()=>inspectSwc(tiny,{specimenId,maxNodes:2}),RangeError);
  assert.throws(()=>inspectSwc(tiny,{specimenId:42}),TypeError);
});
