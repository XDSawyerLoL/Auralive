// Digital regulatory genome. NOT human DNA, nor a model trained on gene expression.
// A/C/G/T are compact numeric encodings; no production mutation permitted.
import {createHash} from 'node:crypto';
export const NEURO_GENOME_SCHEMA='aura-digital-neuroregulation-v1';
const sha=s=>createHash('sha256').update(String(s)).digest('hex');
const bases='ACGT',clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const programs=Object.freeze({
 excitatory_neuron:['membrane_excitability','sodium_channel_proxy','potassium_channel_proxy','calcium_signaling_proxy','glutamate_receptor_proxy','synapse_formation','learning_plasticity','homeostatic_scaling'],
 inhibitory_neuron:['inhibitory_excitability','gaba_receptor_proxy','inhibitory_plasticity','inhibitory_energy_reserve'],
 astrocyte:['potassium_clearance','glutamate_uptake','astrocyte_energy_reserve','astrocyte_support'],
 oligodendrocyte:['myelin_formation','myelin_maintenance','oligodendrocyte_energy_reserve','axon_support'],
 microglia:['microglial_surveillance','microglial_clearance','microglial_resolution','microglial_energy_reserve']
});
export const NEURO_GENOME_CELL_TYPES=Object.freeze(Object.keys(programs));
export const NEURO_GENOME_LOCUS_NAMES=Object.freeze(Object.values(programs).flat());
export const NEURO_GENOME_LOCUS_COUNT=NEURO_GENOME_LOCUS_NAMES.length;
const length=NEURO_GENOME_LOCUS_COUNT*6;
const random=(seed,i)=>parseInt(sha(seed+'|'+i).slice(0,8),16)/4294967296;
const finite=(n,label)=>{if(typeof n!=='number'||!Number.isFinite(n))throw new TypeError('invalid '+label);return n};
function canonical(g){
 if(!g||g.version!==NEURO_GENOME_SCHEMA||typeof g.dna!=='string'||
    g.dna.length!==length||!/^[ACGT]+$/.test(g.dna)||
    !Number.isSafeInteger(g.generation)||g.generation<0||
    !Array.isArray(g.parent_ids)||g.parent_ids.length>2||
    g.parent_ids.some(p=>typeof p!=='string'||!/^[a-f0-9]{24}$/.test(p)))
  throw new TypeError('invalid digital neurogenome');
 const payload={version:g.version,dna:g.dna,generation:g.generation,parent_ids:g.parent_ids};
 const hash=sha(JSON.stringify(payload));
 if(g.id!==hash.slice(0,24)||g.checksum_sha256!==hash)
  throw new Error('neurogenome-integrity-failure');
 return g;
}
export function sealNeuroGenome(dna,{generation=0,parent_ids=[]}={}){
 if(typeof dna!=='string'||dna.length!==length||!/^[ACGT]+$/.test(dna))
  throw new TypeError('invalid digital DNA');
 if(!Number.isSafeInteger(generation)||generation<0||!Array.isArray(parent_ids)||
    parent_ids.length>2||parent_ids.some(p=>typeof p!=='string'||!/^[a-f0-9]{24}$/.test(p)))
  throw new TypeError('invalid ancestry');
 const payload={version:NEURO_GENOME_SCHEMA,dna,generation,parent_ids:[...parent_ids]};
 const hash=sha(JSON.stringify(payload));
 return Object.freeze({...payload,parent_ids:Object.freeze(payload.parent_ids),
   id:hash.slice(0,24),checksum_sha256:hash});
}
export function createNeuroGenome({seed='aura-research-genesis'}={}){
 if(typeof seed!=='string'||seed.length<1||seed.length>128)throw new TypeError('invalid seed');
 return sealNeuroGenome(Array.from({length},(_,i)=>
   bases[Math.floor(random(seed,i)*4)]).join(''));
}
function allele(g,i){
 let n=0;for(const base of g.dna.slice(i*6,i*6+6))n=n*4+bases.indexOf(base);
 return n/4095;
}
export function expressNeuroGenome(genome,{cell_type,development=.5,activity=.5,
 metabolic_pressure=0,inflammatory_signal=0,epigenetic_marks={}}={}){
 canonical(genome);
 if(!programs[cell_type])throw new TypeError('unsupported research cell type');
 const context={development,activity,metabolic_pressure,inflammatory_signal};
 for(const [name,v] of Object.entries(context)){
  finite(v,name);if(v<0||v>1)throw new RangeError('invalid '+name);
 }
 if(!epigenetic_marks||typeof epigenetic_marks!=='object'||Array.isArray(epigenetic_marks))
  throw new TypeError('invalid epigenetic marks');
 for(const [name,v] of Object.entries(epigenetic_marks)){
  if(!NEURO_GENOME_LOCUS_NAMES.includes(name))throw new TypeError('unknown epigenetic locus');
  finite(v,name);if(v < -1||v>1)throw new RangeError('invalid epigenetic mark');
 }
 const expression={};
 for(const name of programs[cell_type]){
  const i=NEURO_GENOME_LOCUS_NAMES.indexOf(name);
  const activityGain=(name.includes('plasticity')||name.includes('surveillance'))?.16:0;
  const developmentGain=(name.includes('formation')||name.includes('synapse'))?.18:0;
  const pressurePenalty=(name.includes('energy')||name.includes('support'))?.22:0;
  const inflammationGain=(name.includes('surveillance')||name.includes('clearance'))?.20:0;
  const inflammationPenalty=name.includes('resolution')?.10:0;
  const value=.12+.72*allele(genome,i)+activityGain*(activity-.5)+
   developmentGain*(development-.5)-pressurePenalty*metabolic_pressure+
   inflammationGain*inflammatory_signal-inflammationPenalty*inflammatory_signal+
   .15*(epigenetic_marks[name]||0);
  expression[name]=Number(clamp(value).toFixed(6));
 }
 // Hypothesized regulatory couplings. Not actual human gene interactions.
 if(cell_type==='astrocyte')for(const key of ['potassium_clearance','glutamate_uptake'])
  expression[key]=Number((expression[key]*
   (.5+.5*expression.astrocyte_energy_reserve)).toFixed(6));
 if(cell_type==='oligodendrocyte')
  expression.myelin_formation=Number((expression.myelin_formation*
   (.5+.5*expression.oligodendrocyte_energy_reserve)).toFixed(6));
 return Object.freeze({schema:NEURO_GENOME_SCHEMA,genome_id:genome.id,cell_type,
  expression:Object.freeze(expression),loci_expressed:Object.keys(expression).length,
  scope:'isolated-research-only',human_gene_annotations:false,
  transcriptomics_fitted:false,biological_equivalence:false,
  inherited_biological_DNA:false,production_write_authorized:false,
  consciousness_inferred:false});
}
export function mutateNeuroGenome(genome,{seed='mutate',sites=1}={}){
 canonical(genome);
 if(!Number.isSafeInteger(sites)||sites<1||sites>8)throw new RangeError('bounded sites only');
 if(typeof seed!=='string'||seed.length>128)throw new TypeError('invalid seed');
 const used=new Set(),chars=genome.dna.split('');
 for(let i=0;used.size<sites&&i<512;i++)
  used.add(Math.floor(random(seed+'|'+genome.id,i)*length));
 if(used.size!==sites)throw new Error('nonunique mutations');
 for(const i of used){
  const step=1+Math.floor(random(seed+'|shift',i)*3);
  chars[i]=bases[(bases.indexOf(chars[i])+step)%4];
 }
 return {child:sealNeuroGenome(chars.join(''),{generation:genome.generation+1,
  parent_ids:[genome.id]}),edited_bases:[...used],sandbox_only:true};
}
export function ablateNeuroGenomeLocus(genome,{cell_type,locus,environment={}}={}){
 canonical(genome);
 if(!programs[cell_type]?.includes(locus))throw new TypeError('invalid expressed locus');
 const index=NEURO_GENOME_LOCUS_NAMES.indexOf(locus);
 const before=expressNeuroGenome(genome,{...environment,cell_type});
 const altered=genome.dna.slice(0,index*6)+'AAAAAA'+genome.dna.slice((index+1)*6);
 const g=sealNeuroGenome(altered,{generation:genome.generation,parent_ids:genome.parent_ids});
 const after=expressNeuroGenome(g,{...environment,cell_type});
 return {locus,cell_type,before:before.expression[locus],after:after.expression[locus],
  difference:Number((after.expression[locus]-before.expression[locus]).toFixed(6)),
  genome_id:genome.id,changed_genome_id:g.id,scope:'paired-sandbox-ablation',
  causal_scope:'deterministic-decoder-only-not-biological-function',
  production_write_authorized:false};
}