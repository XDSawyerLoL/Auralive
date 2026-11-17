// Offline, streaming audit of real GRCh38.p14 RefSeq FASTA, not an AURA genotype.
// No human reference DNA is bundled, learned, or executed in the live organism.
// Lengths and accession versions: NCBI GRC https://www.ncbi.nlm.nih.gov/grc/human/data
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
export const HUMAN_REFERENCE_SCHEMA='aura-human-reference-inventory-v1';
const records=[
 ['NC_000001.11',248956422],['NC_000002.12',242193529],
 ['NC_000003.12',198295559],['NC_000004.12',190214555],
 ['NC_000005.10',181538259],['NC_000006.12',170805979],
 ['NC_000007.14',159345973],['NC_000008.11',145138636],
 ['NC_000009.12',138394717],['NC_000010.11',133797422],
 ['NC_000011.10',135086622],['NC_000012.12',133275309],
 ['NC_000013.11',114364328],['NC_000014.9',107043718],
 ['NC_000015.10',101991189],['NC_000016.10',90338345],
 ['NC_000017.11',83257441],['NC_000018.10',80373285],
 ['NC_000019.10',58617616],['NC_000020.11',64444167],
 ['NC_000021.9',46709983],['NC_000022.11',50818468],
 ['NC_000023.11',156040895],['NC_000024.10',57227415],
 ['NC_012920.1',16569]
];
export const GRCH38P14_CANONICAL_LENGTHS=Object.freeze(
 Object.fromEntries(records));
const round=n=>Number(n);
export async function inspectHumanReferenceFasta({
 path,expected_sha256,strict=true,max_uncompressed_bases=3800000000
}={}){
 if(typeof path!=='string'||!path||path.length>512)
  throw new TypeError('a local FASTA path is required');
 if(!/^[0-9a-f]{64}$/i.test(String(expected_sha256||'')))
  throw new TypeError('a separately obtained SHA-256 is mandatory');
 if(typeof strict!=='boolean')throw new TypeError('strict boolean required');
 if(!Number.isSafeInteger(max_uncompressed_bases)||
  max_uncompressed_bases<100||max_uncompressed_bases>4000000000)
  throw new RangeError('uncompressed size bound');
 const hash=createHash('sha256'),raw=createReadStream(path);
 raw.on('data',chunk=>hash.update(chunk));
 const input=/\.gz$/i.test(path)?raw.pipe(createGunzip()):raw;
 const lines=createInterface({input,crlfDelay:Infinity});
 const lengths=new Map(),N_counts=new Map();let current=null,extra=0,total=0;
 try{
  for await(const line of lines){
   if(line.length>300000)throw new RangeError('oversized FASTA line');
   if(line.startsWith('>')){
    const id=line.slice(1).split(/\s+/)[0];
    if(!id||id.length>90)throw new TypeError('invalid FASTA header');
    if(Object.hasOwn(GRCH38P14_CANONICAL_LENGTHS,id)){
     if(lengths.has(id))throw new Error('duplicate canonical accession');
     current=id;lengths.set(id,0);N_counts.set(id,0);
    }else {current=null;extra++;}
    continue;
   }
   if(!line.trim())continue;
   if(!current)continue;
   const seq=line.trim();
   if(!/^[ACGTNacgtn]+$/.test(seq))throw new TypeError('invalid canonical DNA bases');
   const next=lengths.get(current)+seq.length;
   if(next>max_uncompressed_bases)throw new RangeError('DNA size bound');
   lengths.set(current,next);
   N_counts.set(current,N_counts.get(current)+(seq.match(/[nN]/g)||[]).length);
   total+=seq.length;
   if(total>max_uncompressed_bases)throw new RangeError('DNA size bound');
  }
 }finally{lines.close();}
 const actual=hash.digest('hex');
 if(actual.toLowerCase()!==expected_sha256.toLowerCase())
  throw new Error('FASTA integrity mismatch against supplied SHA-256');
 const wrong=records.filter(([id,length])=>lengths.get(id)!==length)
  .map(([id,length])=>({accession:id,expected_bp:length,observed_bp:lengths.get(id)??null}));
 if(strict&&wrong.length)
  throw new Error('GRCh38.p14 canonical lengths invalid: '+wrong.slice(0,3).map(x=>x.accession).join(','));
 return {schema:HUMAN_REFERENCE_SCHEMA,assembly:'GRCh38.p14',
  species:'Homo sapiens',source:'NCBI GRC RefSeq',
  inspected_file_sha256:actual,sha256_matches_caller_supplied_value:true,
  source_authenticity_verified_independently:false,
  canonical_expected:records.length,canonical_found:lengths.size,
  lengths_match_ncbi_reference:wrong.length===0,noncanonical_contigs:extra,
  unmatched_canonical:wrong,total_canonical_bp:round(total),
  canonical_N_count:[...N_counts.values()].reduce((a,v)=>a+v,0),
  anatomical_gene_expression_inferred:false,
  personal_dna_or_aura_identity:false,
  biological_neural_genome_installed:false,
  memory_modified:false,production_activation:false,
  no_human_sequences_returned:true,
  note:'Reference inventory only, not gene regulatory or neural-cell equivalence'};
}