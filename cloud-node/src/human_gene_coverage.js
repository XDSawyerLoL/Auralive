// Human gene evidence coverage is measurable; functional human gene activity
// is not automatically established by GENCODE annotation, GOA or GTEx RNA.
import {HUMAN_GENE_ATLAS_SCHEMA} from './human_gene_atlas.js';
export const GENE_EVIDENCE_COVERAGE_SCHEMA='aura-human-gene-functional-evidence-coverage-v1';
const EXPERIMENTAL=new Set(['EXP','IDA','IPI','IMP','IGI','IEP','TAS',
 'HDA','HMP','HGI','HEP']);
const sum=o=>Object.values(o).reduce((a,b)=>a+b,0);
export function auditHumanGeneEvidenceCoverage(atlas){
 if(atlas?.schema!==HUMAN_GENE_ATLAS_SCHEMA||!Array.isArray(atlas.genes)||
  atlas.genes.length>120000)throw new TypeError('compiled human gene evidence required');
 const coding=atlas.genes.filter(g=>g.biotype==='protein_coding');
 const types={};for(const g of atlas.genes)types[g.biotype]=(types[g.biotype]||0)+1;
 const codeCounts={},unknown=[];
 let codingWithBulkTpm=0,codingWithGO=0,codingWithExperimentalGO=0;
 let codingWithBoth=0,proteinCodingTotalIsoforms=0,goAssociations=0;
 for(const g of coding){
  const measured=g.brain_median_tpm&&Object.values(g.brain_median_tpm).some(
   v=>typeof v==='number'&&Number.isFinite(v)&&v>=0);
  const terms=Array.isArray(g.go_terms)?g.go_terms:[];
  const hasExperimental=terms.some(x=>EXPERIMENTAL.has(x.evidence));
  if(measured)codingWithBulkTpm++;
  if(terms.length)codingWithGO++;
  if(hasExperimental)codingWithExperimentalGO++;
  if(measured&&terms.length)codingWithBoth++;
  proteinCodingTotalIsoforms+=Array.isArray(g.transcripts)?g.transcripts.length:0;
  goAssociations+=terms.length;
  for(const t of terms)codeCounts[t.evidence]=(codeCounts[t.evidence]||0)+1;
  if(unknown.length<20&&(!measured||terms.length===0))
   unknown.push({id:g.ensembl_gene_id,symbol:g.symbol,
    reason:[!measured?'no-measured-bulk-brain-TPM':null,
     terms.length===0?'no-retained-GO-association':null].filter(Boolean)});
 }
 const ratio=(n,d)=>d?Number((n/d).toFixed(5)):0;
 return {schema:GENE_EVIDENCE_COVERAGE_SCHEMA,
  denominator:'GENCODE annotated protein-coding gene records',
  totals:{annotated_genes:atlas.genes.length,protein_coding: coding.length,
   protein_coding_isoforms:proteinCodingTotalIsoforms,
   goa_associations_retained:goAssociations},
  observed:{coding_with_bulk_brain_tpm:codingWithBulkTpm,
   coding_with_any_goa:codingWithGO,
   coding_with_experimental_goa:codingWithExperimentalGO,
   coding_with_both_tpm_and_goa:codingWithBoth},
  proportions:{coding_bulk_tpm:ratio(codingWithBulkTpm,coding.length),
   coding_any_goa:ratio(codingWithGO,coding.length),
   coding_experimental_goa:ratio(codingWithExperimentalGO,coding.length),
   coding_both_tpm_goa:ratio(codingWithBoth,coding.length)},
  biotypes:types,go_evidence_codes:codeCounts,
  example_unmeasured_or_unannotated:unknown,
  completely_characterized_human_genes:0,
  complete_protein_regulatory_network_known:false,
  experimentally_tested_gene_to_neuron_kinetics:false,
  isolated_gene_functions_do_not_imply_development:true,
  full_human_genome_emulation:false,
  model_is_not_biological_equivalence_certificate:true,
  note:'GO evidence is gene-product association; TPM is population RNA abundance, neither is an end-to-end functional model'};
}
