// Evidence-gated gene-expression -> network perturbation, research ONLY.
// GO annotation and bulk GTEx RNA TPM do NOT provide conductance/protein kinetics.
// Gene roles below are explicit pre-registered hypotheses, not learned magic
// parameters; missing expression / GO evidence never receives an invented value.
import {HUMAN_GENE_ATLAS_SCHEMA} from './human_gene_atlas.js';
import {simulateAnatomicalMotifs} from './anatomical_circuit_motifs.js';
export const MEASURED_GENE_CIRCUIT_SCHEMA='aura-gtex-gene-network-experiment-v1';
export const NEURAL_GENE_PANELS=Object.freeze({
 membrane_sodium:Object.freeze(['SCN1A','SCN2A','SCN8A']),
 membrane_potassium:Object.freeze(['KCNQ2','KCNQ3','KCNA1']),
 inhibitory_gaba:Object.freeze(['GAD1','GAD2','SLC6A1']),
 glutamate_plasticity:Object.freeze(['GRIN1','GRIN2A','GRIA1']),
 glial_clearance:Object.freeze(['SLC1A2','SLC1A3','KCNJ10']),
 myelin:Object.freeze(['MBP','PLP1','MOG']),
 energy_supply:Object.freeze(['SLC2A1','ATP1A3']),
 immune_modulation:Object.freeze(['CSF1R','TREM2','P2RY12']),
});
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const round=x=>Number(x.toFixed(7));
const safeFinite=(v,a,b,name)=>{
 if(typeof v!=='number'||!Number.isFinite(v)||v<a||v>b)
  throw new RangeError('invalid '+name);
 return v;
};
function verifyAtlas(atlas,{require_complete_data}){
 if(atlas?.schema!==HUMAN_GENE_ATLAS_SCHEMA||!Array.isArray(atlas.genes)||
  !atlas.source_sha256||!atlas.counts)
  throw new TypeError('GENCODE/GTEx/GOA compiled gene atlas required');
 if(require_complete_data&&atlas.complete_source_coverage_gate_passed!==true)
  throw new Error('full measured source coverage gate not passed');
 if(atlas.genes.length>120000)throw new RangeError('gene atlas exceeds research limit');
}
function pickTissue(gene,brain_tissue){
 const values=gene.brain_median_tpm;
 if(!values||!Object.hasOwn(values,brain_tissue))return null;
 const v=values[brain_tissue];
 if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e9)
  throw new TypeError('corrupt GTEx brain TPM');
 return v;
}
function expressionSignal(tpm){
 // A dimensionless display/inference HEURISTIC, not protein channel density.
 return clamp(Math.log1p(tpm)/Math.log1p(50));
}
export function deriveMeasuredNeuralInputs(atlas,{
 brain_tissue='Brain - Cortex',interventions=[],
 require_complete_data=true,require_go_evidence=true
}={}){
 verifyAtlas(atlas,{require_complete_data});
 if(typeof brain_tissue!=='string'||!/^Brain - [a-zA-Z\d ().-]+$/.test(brain_tissue)||
  brain_tissue.length>100)
  throw new TypeError('GTEx brain tissue name required');
 if(!Array.isArray(interventions)||interventions.length>8)
  throw new RangeError('bounded gene interventions required');
 if(typeof require_go_evidence!=='boolean')
  throw new TypeError('GO evidence flag required');
 const modifications=new Map();
 for(const mutation of interventions){
  if(!mutation||typeof mutation.symbol!=='string'||!/^[A-Za-z0-9-]{2,24}$/.test(mutation.symbol)||
    modifications.has(mutation.symbol))throw new TypeError('unique gene symbol required');
  safeFinite(mutation.scale,0,2,'expression intervention scale');
  modifications.set(mutation.symbol,mutation.scale);
 }
 const symbols=new Set(Object.values(NEURAL_GENE_PANELS).flat());
 const bySymbol=new Map(),ambiguous=new Set();
 for(const gene of atlas.genes){
  if(!symbols.has(gene.symbol))continue;
  if(bySymbol.has(gene.symbol)){ambiguous.add(gene.symbol);continue;}
  bySymbol.set(gene.symbol,gene);
 }
 for(const x of ambiguous)bySymbol.delete(x);
 for(const x of modifications.keys())
  if(!symbols.has(x))throw new TypeError('gene outside pre-registered neural pathways: '+x);
 const panels={},geneEvidence={};let observed=0,goObserved=0;
 for(const [name,members] of Object.entries(NEURAL_GENE_PANELS)){
  const included=[];
  for(const symbol of members){
   const gene=bySymbol.get(symbol);
   if(!gene||gene.biotype!=='protein_coding')continue;
   const raw=pickTissue(gene,brain_tissue);
   if(raw===null)continue;
   const go=Array.isArray(gene.go_terms)?gene.go_terms:[];
   if(require_go_evidence&&go.length===0)continue;
   const scale=modifications.get(symbol)??1;
   const factor=expressionSignal(raw*scale);
   included.push(factor);
   geneEvidence[symbol]={
    ensembl_gene_id:gene.ensembl_gene_id,tpm_measured:round(raw),
    expression_scale_hypothesis:scale,signal_heuristic:round(factor),
    gtex_tissue:brain_tissue,go_evidence_available:go.length>0,
    go_evidence_codes:[...new Set(go.map(x=>x.evidence))].slice(0,10),
    annotation_biotype:gene.biotype,
    model_fit_to_human_ephys:false};
   observed++;
   if(go.length>0)goObserved++;
  }
  panels[name]={present:included.length,expected:members.length,
   normalized_mean:included.length?
    round(included.reduce((a,v)=>a+v,0)/included.length):null};
 }
 if(observed===0)throw new Error('no measured neural gene evidence');
 const signals=Object.fromEntries(Object.entries(panels).map(([key,v])=>
  [key,v.normalized_mean]));
 // Neutral (1) on missing evidence; no made-up TPM. The scale and baseline
 // mapping are explicitly uncalibrated and must be replaced by real fits.
 const scalar=(name,positive=.4)=>
  signals[name]===null?1:clamp(.8+positive*signals[name],.5,1.5);
 const gains={
  excitatory_gain:round(clamp(
   scalar('membrane_sodium',.6)/scalar('membrane_potassium',.35),.2,2)),
  inhibitory_gain:round(clamp(scalar('inhibitory_gaba',.6),.2,2)),
  plasticity_learning_gain:round(clamp(scalar('glutamate_plasticity',.9),0,3)),
  conduction_gain:round(clamp(scalar('myelin',.55),.5,1.5)),
  metabolic_supply:round(clamp(.7+.25*(signals.energy_supply??.6)*
   (signals.glial_clearance===null?1:(.8+.2*signals.glial_clearance)),0,1)),
  inflammation:round(clamp(.18*(1-(signals.immune_modulation??0)*.5),0,1))
 };
 return {
  schema:MEASURED_GENE_CIRCUIT_SCHEMA,brain_tissue,panels,
  measured_gene_evidence:geneEvidence,
  observed_panel_genes:observed,observed_panel_genes_with_go:goObserved,
  expression_units:'GTEx median TPM bulk tissue, not neuronal single cell',
  genetics_source:'GENCODE gene identity/isoforms, not DNA variant genotype',
  functions_source:'GOA protein-product associations, not proven kinetics',
  gains,evidence_to_gain_calibrated:false,
  all_annotated_genes_simulated:false,
  panel_symbols_in_model:Object.values(NEURAL_GENE_PANELS).flat().length,
  interventions:interventions.map(x=>({...x})),
  production_activation:false};
}
export function simulateMeasuredGeneCircuit(atlas,{
 brain_tissue='Brain - Cortex',interventions=[],require_complete_data=true,
 require_go_evidence=true,circuit_options={}
}={}){
 if(!circuit_options||typeof circuit_options!=='object'||Array.isArray(circuit_options))
  throw new TypeError('circuit options must be an object');
 const measured=deriveMeasuredNeuralInputs(atlas,{
  brain_tissue,interventions,require_complete_data,require_go_evidence});
 const circuit=simulateAnatomicalMotifs({...circuit_options,...measured.gains});
 return {
  schema:MEASURED_GENE_CIRCUIT_SCHEMA,measured,circuit,
  evidence_is_not_causal_gene_function:false,
  tissue_expression_is_not_cell_specific:true,
  human_gene_channel_kinetics_validated:false,
  production_state_unchanged:true,llm_used:false};
}
export function pairedMeasuredGeneKnockdown(atlas,{
 symbol,brain_tissue='Brain - Cortex',require_complete_data=true,
 require_go_evidence=true,circuit_options={}
}={}){
 if(typeof symbol!=='string')throw new TypeError('target gene symbol required');
 const settings={brain_tissue,require_complete_data,require_go_evidence,circuit_options};
 const control=simulateMeasuredGeneCircuit(atlas,settings);
 if(!Object.hasOwn(control.measured.measured_gene_evidence,symbol))
  throw new TypeError('target gene not supported by measured functional evidence');
 const knockdown=simulateMeasuredGeneCircuit(atlas,{
  ...settings,interventions:[{symbol,scale:0}]});
 const delta=Object.fromEntries(Object.keys(control.circuit.rates).map(key=>[
  key,round(knockdown.circuit.rates[key]-control.circuit.rates[key])
 ]));
 return {schema:MEASURED_GENE_CIRCUIT_SCHEMA,symbol,control,knockdown,delta,
  knockdown_is_expression_perturbation_not_CRISPR:true,
  observed_numerical_difference:Object.values(delta).some(v=>v!==0)||
   control.circuit.trace.some((x,i)=>Object.keys(x).some(k=>
    k!=='time_ms'&&Math.abs(x[k]-knockdown.circuit.trace[i][k])>1e-7)),
  in_silico_model_only:true,independent_human_cell_validation:false,
  production_state_unchanged:true};
}
