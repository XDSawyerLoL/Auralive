import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {GRCH38P14_CANONICAL_LENGTHS,inspectHumanReferenceFasta}
 from '../src/human_reference_genome.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('GRCh38.p14 reference inventory uses 25 documented primary accession identifiers',()=>{
 assert.equal(Object.keys(GRCH38P14_CANONICAL_LENGTHS).length,25);
 assert.equal(GRCH38P14_CANONICAL_LENGTHS['NC_000001.11'],248956422);
 assert.equal(GRCH38P14_CANONICAL_LENGTHS['NC_000023.11'],156040895);
 assert.equal(GRCH38P14_CANONICAL_LENGTHS['NC_012920.1'],16569);
 assert.ok(Object.values(GRCH38P14_CANONICAL_LENGTHS).reduce((a,b)=>a+b,0)>3e9);
});
test('streaming FASTA inspect refuses an abbreviated genome as a full human assembly',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'aura-ref-'));
 try{
  const fasta='>NC_000001.11 Homo sapiens chromosome 1\nACGTNN\n';
  const path=join(dir,'human.fa');
  writeFileSync(path,fasta);
  const preview=await inspectHumanReferenceFasta({path,expected_sha256:sha(fasta),strict:false});
  assert.equal(preview.canonical_found,1);
  assert.equal(preview.total_canonical_bp,6);
  assert.equal(preview.canonical_N_count,2);
  assert.equal(preview.lengths_match_ncbi_reference,false);
  assert.equal(preview.source_authenticity_verified_independently,false);
  assert.equal(preview.personal_dna_or_aura_identity,false);
  assert.equal(preview.no_human_sequences_returned,true);
  await assert.rejects(()=>inspectHumanReferenceFasta({
   path,expected_sha256:sha(fasta)}),/canonical lengths invalid/);
  await assert.rejects(()=>inspectHumanReferenceFasta({
   path,expected_sha256:'0'.repeat(64),strict:false}),/integrity mismatch/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('gzip stream checks compressed bytes and rejects duplicated accessions',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'aura-ref-'));
 try{
  const text='>NC_000001.11\nACGT\n>NC_000001.11\nACGT\n';
  const zipped=gzipSync(text),path=join(dir,'human.fa.gz');
  writeFileSync(path,zipped);
  await assert.rejects(()=>inspectHumanReferenceFasta({
   path,expected_sha256:sha(zipped),strict:false}),/duplicate canonical accession/);
  const okText='>NC_012920.1\nACGTN\n';
  const okZipped=gzipSync(okText);
  writeFileSync(path,okZipped);
  const parsed=await inspectHumanReferenceFasta({
   path,expected_sha256:sha(okZipped),strict:false});
  assert.equal(parsed.canonical_found,1);
  assert.equal(parsed.canonical_N_count,1);
  assert.equal(parsed.sha256_matches_caller_supplied_value,true);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('invalid FASTA base and missing external checksum never count as real genome',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'aura-ref-'));
 try{
  const text='>NC_000001.11\nACXG\n';
  const path=join(dir,'invalid.fa');
  writeFileSync(path,text);
  await assert.rejects(()=>inspectHumanReferenceFasta({
   path,expected_sha256:sha(text),strict:false}),/invalid canonical DNA bases/);
  await assert.rejects(()=>inspectHumanReferenceFasta({
   path,expected_sha256:'',strict:false}),/SHA-256/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});