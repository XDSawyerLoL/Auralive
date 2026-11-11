// A proto-genetic *digital* representation, not human DNA and not autonomous
// self-modifying production code. Mutations affect sandbox parameter values
// only. "Quantum-inspired" sampler is entirely classical softmax arithmetic.
import {createHash} from 'node:crypto';
import {preRegisterProtocol,runABStudy} from './p0_ab_sandbox.js';
const sha=s=>createHash('sha256').update(String(s)).digest('hex');
const ALPHABET='ACGT',LENGTH=48;
const SITES=Object.freeze([
 ['inspection_bias',-2,2],
 ['exploration_period',3,10],
 ['failure_penalty',1,8],
 ['attention_gain',0,.08],
 ['uncertainty_threshold',.5,.95],
 ['homeostasis_recovery',.001,.14],
 ['plasticity',.05,.9],
 ['memory_decay',.001,.10],
]);
export const DIGITAL_GENOME_VERSION='aura-digital-protogenome-v1';
const sample=(seed,i)=>parseInt(sha(seed+'|'+i).slice(0,8),16)/4294967296;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function validity(dna){
 return typeof dna==='string'&&dna.length===LENGTH&&/^[ACGT]+$/.test(dna);
}
export function createDigitalGenome({seed='aura-genesis-v1',generation=0,parent_ids=[]}={}){
 let dna='';
 for(let i=0;i<LENGTH;i++)dna+=ALPHABET[Math.floor(sample(seed,i)*4)];
 return sealDigitalGenome(dna,{generation,parent_ids});
}
export function sealDigitalGenome(dna,{
 generation=0,parent_ids=[],
}={}){
 if(!validity(dna))throw Error('invalid-digital-protogenome');
 const data={version:DIGITAL_GENOME_VERSION,dna,
  generation:Math.max(0,Math.floor(Number(generation)||0)),
  parent_ids:(Array.isArray(parent_ids)?parent_ids:[])
    .slice(0,2).map(x=>String(x).slice(0,64))};
 return Object.freeze({...data,id:sha(JSON.stringify(data)).slice(0,24),
  checksum_sha256:sha(JSON.stringify(data))});
}
export function expressDigitalGenome(genome){
 if(!validity(genome?.dna)||
   sealDigitalGenome(genome.dna,{generation:genome.generation,
     parent_ids:genome.parent_ids}).checksum_sha256!==genome.checksum_sha256)
   throw Error('digital-protogenome-integrity-failure');
 const traits={};
 for(let i=0;i<SITES.length;i++){
  const [name,min,max]=SITES[i];
  let encoded=0;
  for(const b of genome.dna.slice(i*6,i*6+6))
   encoded=encoded*4+ALPHABET.indexOf(b);
  const decoded=min+encoded/4095*(max-min);
  traits[name]=name==='exploration_period'?Math.round(decoded):
   Number(decoded.toFixed(5));
 }
 return Object.freeze({version:DIGITAL_GENOME_VERSION,id:genome.id,
  traits,expression_scope:'only-isolated-sandbox-trials',
  production_mutation_allowed:false,
  subjective_experience_proven:false,quantum_process_used:false});
}
export function mutateDigitalGenome(genome,{
 seed='laboratory',sites=2,
}={}){
 if(!Number.isInteger(sites)||sites<1||sites>4)
  throw Error('invalid-mutation-sites');
 const before=expressDigitalGenome(genome);
 const array=genome.dna.split(''),indices=new Set();
 for(let i=0;indices.size<sites;i++)
  indices.add(Math.floor(sample(seed+'|'+genome.id,i)*LENGTH));
 const edits=[];
 for(const index of indices){
  const old=array[index],shift=1+Math.floor(sample(seed+'|mutate',index)*3);
  array[index]=ALPHABET[(ALPHABET.indexOf(old)+shift)%4];
  edits.push({site:index,from:old,to:array[index]});
 }
 const child=sealDigitalGenome(array.join(''),{
  generation:Math.max(0,Number(genome.generation)||0)+1,
  parent_ids:[genome.id],
 });
 return {parent:before.id,child,edits,
  phenotype:expressDigitalGenome(child)};
}
export function recombineDigitalGenomes(first,second,{seed='crossover'}={}){
 expressDigitalGenome(first);expressDigitalGenome(second);
 const point=1+Math.floor(sample(seed,0)*(LENGTH-1));
 return sealDigitalGenome(first.dna.slice(0,point)+second.dna.slice(point),{
  generation:Math.max(first.generation,second.generation)+1,
  parent_ids:[first.id,second.id],
 });
}
export function studyDigitalGenome(genome,{
 seed_base=400001,draws=8,
}={}){
 const expression=expressDigitalGenome(genome);
 const g=expression.traits;
 const cfg=preRegisterProtocol({
  seed_base,draws,
  failure_penalty:g.failure_penalty,
  exploration_period:g.exploration_period,
  inspection_decision_bias:g.inspection_bias,
 });
 const study=runABStudy({config:cfg});
 if(!study.executed)throw Error('experimental-sandbox-unavailable');
 const fitness=Number((
  100*study.passes/study.draws+
  12*study.metrics.difference_in_differences+
  8*study.metrics.A_heldout_accuracy+
  8*study.metrics.B_heldout_accuracy-
  study.metrics.mean_inspection_cost*.09
 ).toFixed(4));
 return {genome_id:genome.id,traits:g,fitness,
  protocol_sha256:cfg.preregistered_sha256,
  accepted:study.accepted,study_draws:study.draws,
  metrics:study.metrics,run_scope:'offline-sandbox-only'};
}
// Softmax over candidate fitness is a temperature-controlled CLASSSICAL
// probabilistic selection scheme, NOT quantum superposition / hardware.
export function classicalBoltzmannSelection(candidates=[],{
 temperature=.7,seed='reproducible-choice',
}={}){
 const candidatesCopy=candidates.filter(x=>Number.isFinite(x.fitness));
 if(!candidatesCopy.length)return null;
 const T=clamp(Number(temperature)||.7,.05,10);
 const highest=Math.max(...candidatesCopy.map(x=>x.fitness));
 const values=candidatesCopy.map(x=>Math.exp((x.fitness-highest)/T));
 const sum=values.reduce((a,b)=>a+b,0);
 const threshold=sample(seed,candidatesCopy.length)*sum;
 let cumulative=0;
 for(let i=0;i<candidatesCopy.length;i++){
  cumulative+=values[i];
  if(cumulative>=threshold)return {candidate:candidatesCopy[i],
    method:'classical-softmax-temperature',temperature:T,
    quantum_hardware_used:false};
 }
 return {candidate:candidatesCopy.at(-1),
  method:'classical-softmax-temperature',temperature:T,
  quantum_hardware_used:false};
}
export function evolveDigitalGenome({
 seed='aura-evolution-lab',generations=3,population=6,
}={}){
 if(!Number.isInteger(generations)||generations<1||generations>8||
  !Number.isInteger(population)||population<3||population>12)
   throw Error('bounded-sandbox-only-evolution');
 let genomes=Array.from({length:population},(_,i)=>
  createDigitalGenome({seed:seed+'-initial-'+i}));
 const history=[];
 for(let generation=0;generation<generations;generation++){
  const scored=genomes.map(genome=>({genome,
   assessment:studyDigitalGenome(genome,{seed_base:400001,draws:8})}))
    .sort((a,b)=>b.assessment.fitness-a.assessment.fitness);
  history.push({
   generation,mean_fitness:Number((scored.reduce((a,x)=>a+x.assessment.fitness,0)/
      scored.length).toFixed(3)),
   best_fitness:scored[0].assessment.fitness,
   best_id:scored[0].genome.id,
  });
  genomes=[scored[0].genome];
  for(let i=1;i<population;i++){
   const picked=classicalBoltzmannSelection(scored.map(x=>({
    ...x,fitness:x.assessment.fitness})),{
     temperature:2,seed:seed+'|'+generation+'|'+i});
   const child=mutateDigitalGenome(picked.candidate.genome,{
    seed:seed+'|'+generation+'|'+i,sites:1+(i%3)}).child;
   genomes.push(child);
  }
 }
 const scored=genomes.map(genome=>({genome,
  assessment:studyDigitalGenome(genome,{seed_base:400001,draws:8})}))
  .sort((a,b)=>b.assessment.fitness-a.assessment.fitness);
 const winner=scored[0].genome;
 const independentValidation=studyDigitalGenome(winner,{
  seed_base:900007,draws:24,
 });
 return {version:DIGITAL_GENOME_VERSION,
  winner:{id:winner.id,generation:winner.generation,
   dna:winner.dna,traits:expressDigitalGenome(winner).traits,
   checksum_sha256:winner.checksum_sha256},
  history,training_fitness:scored[0].assessment.fitness,
  independentValidation,
  production_adoption:'NOT_AUTHORIZED',
  autoselfrewrite:false,sandbox_only:true,
  classical_not_quantum:true,
  genetic_analogy_not_biological_equivalence:true};
}
