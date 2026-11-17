// Read-only OFFLINE evidence access. No network, AURA production state,
// gene expression mutation, or personal DNA. Queries show observed data.
import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {HUMAN_GENE_ATLAS_SCHEMA} from './human_gene_atlas.js';
export async function openHumanGeneAtlasArtifact(path,{sha256}={}){
 if(typeof path!=='string'||!path.endsWith('.json.gz')||path.length>700)
  throw new TypeError('expected local gzipped atlas path');
 if(typeof sha256!=='string'||!/^[a-f0-9]{64}$/i.test(sha256))
  throw new TypeError('saved artifact SHA-256 required');
 const s=await stat(path);
 if(s.size<20||s.size>50000000)throw new RangeError('artifact size outside bounds');
 const bytes=await readFile(path);
 const actual=createHash('sha256').update(bytes).digest('hex');
 if(actual!==sha256.toLowerCase())throw new Error('human gene evidence artifact checksum mismatch');
 const plain=gunzipSync(bytes,{maxOutputLength:250000000});
 const result=JSON.parse(plain.toString('utf8'));
 if(result?.schema!==HUMAN_GENE_ATLAS_SCHEMA||!Array.isArray(result.genes)||
  !result.source_sha256||!result.counts)
  throw new TypeError('invalid compiled human gene evidence');
 if(result.genes.length>120000)throw new RangeError('gene evidence record count');
 return result;
}
export function findHumanGeneEvidence(atlas,query){
 if(atlas?.schema!==HUMAN_GENE_ATLAS_SCHEMA||!Array.isArray(atlas.genes))
  throw new TypeError('compiled evidence required');
 if(typeof query!=='string'||!/^([A-Za-z0-9_-]{2,50})$/.test(query))
  throw new TypeError('gene symbol or Ensembl stable id required');
 const needle=query.toUpperCase();
 const matches=atlas.genes.filter(g=>g.symbol.toUpperCase()===needle||
  g.ensembl_gene_id.toUpperCase()===needle);
 if(!matches.length)return {query,matched:false,genes:[],source:atlas.sources,
  not_found_is_not_nonexistent:true};
 if(matches.length>8)throw new Error('ambiguous query returns too many loci');
 return {query,matched:true,genes:matches.map(g=>({
  ensembl_gene_id:g.ensembl_gene_id,symbol:g.symbol,biotype:g.biotype,
  chr:g.chr,start:g.start,end:g.end,strand:g.strand,
  isoform_count:g.transcripts.length,isoforms:g.transcripts,
  brain_median_tpm:g.brain_median_tpm,
  gene_ontology_functional_annotations:g.go_terms,
  association_records_truncated:g.go_terms_dropped,
  empirical_channel_kinetics_present:false,
  regulation_function_validated_in_human_neuron:false
 })),source:atlas.sources,
 tissue_expression_bulk_not_single_cell:true,
 go_annotation_is_association_not_mechanistic_proof:true,
 production_activation:false};
}
