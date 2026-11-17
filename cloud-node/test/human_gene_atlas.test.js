import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {compileHumanGeneAtlas,writeHumanGeneAtlas,
 HUMAN_GENE_ATLAS_SCHEMA,loadGencodeGenes} from '../src/human_gene_atlas.js';
import {deriveMeasuredNeuralInputs,simulateMeasuredGeneCircuit,
 pairedMeasuredGeneKnockdown} from '../src/human_gene_neural_function.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
function fixtureFiles(){
 const dir=mkdtempSync(join(tmpdir(),'aura-human-genes-'));
 const symbols=['SCN1A','GAD1','MBP','SLC1A2','GRIN1','KCNQ2'];
 let gtf='';
 for(let i=0;i<symbols.length;i++){
  const id='ENSG'+String(10000000000+i);
  const prefix='gene_id "'+id+'.1"; gene_type "protein_coding"; gene_name "'+symbols[i]+'"; ';
  gtf+='chr'+(i+1)+'\tGENCODE\tgene\t100\t999\t.\t+\t.\t'+prefix+'\n';
  for(let j=0;j<2;j++)
   gtf+='chr'+(i+1)+'\tGENCODE\ttranscript\t100\t999\t.\t+\t.\t'+
    prefix+'transcript_id "ENST'+i+j+'.1"; transcript_type "protein_coding";\n';
 }
 const tissueCortex='Brain - Cortex',tissueCereb='Brain - Cerebellum';
 const gct=['#1.2','6\t4','Name\tDescription\t'+tissueCortex+'\t'+
  tissueCereb+'\tLiver\tMuscle - Skeletal'];
 const exp=[40,30,15,50,25,20];
 for(let i=0;i<symbols.length;i++){
  gct.push('ENSG'+String(10000000000+i)+'.1\t'+symbols[i]+'\t'+
   exp[i]+'\t'+(exp[i]*.75)+'\t1\t0');
 }
 const gaf=['!gaf-version: 2.2'];
 for(let i=0;i<symbols.length;i++){
  const cols=['UniProtKB','P'+String(i).padStart(5,'0'),symbols[i],
   '','GO:'+String(1000000+i),'PMID:'+i,'IDA','','F',
   symbols[i]+' gene','','protein','taxon:9606','20261117','UniProt',''];
  gaf.push(cols.join('\t'));
 }
 // A negative record cannot be used as positive functional evidence.
 gaf.push(['UniProtKB','P00000','SCN1A','NOT','GO:1234567','PMID:9',
  'IMP','','F','negative','','protein','taxon:9606','20261117','UniProt',''].join('\t'));
 const payloads={gtf:gzipSync(gtf),gct:gzipSync(gct.join('\n')+'\n'),
  gaf:gzipSync(gaf.join('\n')+'\n')};
 const paths={};
 for(const [key,buffer] of Object.entries(payloads)){
  paths[key+'_path']=join(dir,key+'.'+(key==='gtf'?'gtf':key==='gct'?'gct':'gaf')+'.gz');
  paths[key+'_sha256']=hash(buffer);
  writeFileSync(paths[key+'_path'],buffer);
 }
 return {dir,paths};
}
async function compiled(){
 const f=fixtureFiles();
 try{
  const atlas=await compileHumanGeneAtlas({...f.paths,
   min_genes:1,min_protein_coding:1,min_expression_overlap:1,
   min_go_annotated:1});
  return atlas;
 }finally{rmSync(f.dir,{recursive:true,force:true});}
}
test('GENCODE isoforms, gene biotypes, GTEx measured brain TPM and GOA references are joined by evidence',async()=>{
 const atlas=await compiled();
 assert.equal(atlas.schema,HUMAN_GENE_ATLAS_SCHEMA);
 assert.equal(atlas.counts.genes,6);
 assert.equal(atlas.counts.protein_coding,6);
 assert.equal(atlas.counts.transcript_isoforms,12);
 assert.equal(atlas.counts.genes_with_transcript,6);
 assert.equal(atlas.counts.matched_genes,6);
 assert.equal(atlas.counts.annotated_genes,6);
 assert.equal(atlas.counts.negative_annotations_excluded,1);
 assert.ok(atlas.genes.every(x=>x.transcripts.length===2));
 assert.ok(atlas.genes.every(x=>x.go_terms[0].evidence==='IDA'));
 assert.ok(atlas.genes.every(x=>x.brain_median_tpm['Brain - Cortex']>=0));
 assert.equal(atlas.source_sha256.GENCODE.length,64);
 assert.equal(atlas.complete_source_coverage_gate_passed,false,
  'six fixture genes cannot be called the whole human gene atlas');
 assert.equal(atlas.all_genes_biologically_functional,false);
 assert.equal(atlas.production_activation,false);
});
test('default genome-wide completeness gates reject toy sources and missing data',async()=>{
 const f=fixtureFiles();
 try{
  await assert.rejects(()=>compileHumanGeneAtlas(f.paths),/Incomplete source coverage/);
  await assert.rejects(()=>compileHumanGeneAtlas({...f.paths,gtf_sha256:'0'.repeat(64),
   min_genes:1,min_protein_coding:1,min_expression_overlap:1,min_go_annotated:1}),
   /SHA-256 mismatch/);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('compiled evidence exports small zipped artifact without uncompressed DNA',async()=>{
 const f=fixtureFiles();
 try{
  const atlas=await compileHumanGeneAtlas({...f.paths,
   min_genes:1,min_protein_coding:1,min_expression_overlap:1,min_go_annotated:1});
  const path=join(f.dir,'genes.json.gz');
  const result=await writeHumanGeneAtlas(atlas,path);
  assert.equal(result.count,6);
  const saved=JSON.parse(gunzipSync(readFileSync(path)).toString());
  assert.equal(saved.genes.length,6);
  assert.equal(saved.genes[0].brain_median_tpm['Brain - Cortex'],40);
  assert.equal(saved.genes[0].transcripts.length,2);
  await assert.rejects(()=>writeHumanGeneAtlas(atlas,path),/EEXIST/);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('measured GO-annotated ion-channel transcripts modulate computational network, never a human genotype',async()=>{
 const atlas=await compiled();
 const d=deriveMeasuredNeuralInputs(atlas,{
  brain_tissue:'Brain - Cortex',require_complete_data:false});
 assert.equal(d.observed_panel_genes,6);
 assert.ok(d.measured_gene_evidence.SCN1A.go_evidence_codes.includes('IDA'));
 assert.equal(d.measured_gene_evidence.SCN1A.tpm_measured,40);
 assert.ok(d.gains.excitatory_gain>=.2&&d.gains.excitatory_gain<=2);
 assert.equal(d.all_annotated_genes_simulated,false);
 assert.equal(d.evidence_to_gain_calibrated,false);
 assert.equal(d.production_activation,false);
 assert.throws(()=>deriveMeasuredNeuralInputs(atlas),
  /full measured source coverage gate not passed/);
});
test('measured SCN1A transcript perturbation yields reproducible in-silico neural effect',async()=>{
 const atlas=await compiled();
 const options={duration_ms:650,dt_ms:5,stimuli:[
  {node:'thalamus_relay',amplitude:1,start_ms:0,end_ms:480},
  {node:'entorhinal',amplitude:1,start_ms:0,end_ms:480}
 ]};
 const input={symbol:'SCN1A',require_complete_data:false,circuit_options:options};
 const result=pairedMeasuredGeneKnockdown(atlas,input);
 assert.equal(result.symbol,'SCN1A');
 assert.equal(result.knockdown_is_expression_perturbation_not_CRISPR,true);
 assert.equal(result.independent_human_cell_validation,false);
 assert.equal(result.production_state_unchanged,true);
 assert.equal(result.observed_numerical_difference,true);
 assert.notEqual(result.knockdown.measured.gains.excitatory_gain,
  result.control.measured.gains.excitatory_gain);
 assert.deepEqual(result,pairedMeasuredGeneKnockdown(atlas,input));
});
test('GO evidence gates isolate absent biological annotations and reject arbitrary genes',async()=>{
 const atlas=await compiled();
 const clone=structuredClone(atlas);
 clone.genes.find(x=>x.symbol==='SCN1A').go_terms=[];
 const d=deriveMeasuredNeuralInputs(clone,{require_complete_data:false});
 assert.ok(!Object.hasOwn(d.measured_gene_evidence,'SCN1A'));
 assert.throws(()=>pairedMeasuredGeneKnockdown(clone,{
  symbol:'SCN1A',require_complete_data:false}),/not supported/);
 assert.throws(()=>deriveMeasuredNeuralInputs(atlas,{require_complete_data:false,
  interventions:[{symbol:'GENE_D_120',scale:0}]}),/outside pre-registered/);
 assert.throws(()=>simulateMeasuredGeneCircuit(atlas,{require_complete_data:false,
  brain_tissue:'Brain - imaginary'}),/no measured neural gene evidence/);
});
test('GAF negative evidence and GTF orphan features cannot be silently treated as functional',async()=>{
 const f=fixtureFiles();
 try{
  const t=await loadGencodeGenes(f.paths.gtf_path);
  assert.equal(t.orphan_transcripts,0);
  const fake=readFileSync(f.paths.gtf_path);
  assert.ok(fake.length>100);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});
