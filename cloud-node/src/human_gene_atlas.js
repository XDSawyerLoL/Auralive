// Offline evidence compiler for REAL human genes, GENCODE v50 + GTEx v10
// + GOA human GAF. No invented loci, no reference DNA stored, no live AURA writes.
// The resulting atlas is an evidence index, NOT a functional genome emulation.
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {createGunzip,gzipSync} from 'node:zlib';
import {writeFile} from 'node:fs/promises';
export const HUMAN_GENE_ATLAS_SCHEMA='aura-human-gene-evidence-v1';
export const HUMAN_GENE_SOURCES=Object.freeze({
 annotation:{name:'GENCODE',release:'50',assembly:'GRCh38.p14',
  url:'https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_50/gencode.v50.primary_assembly.annotation.gtf.gz'},
 expression:{name:'GTEx',release:'v10',units:'median TPM, bulk tissue',
  url:'https://www.gtexportal.org/home/downloads/adult-gtex/overview'},
 functions:{name:'GO Consortium / GOA',format:'GAF 2.2',
  url:'https://current.geneontology.org/annotations/gaf/HUMAN-uniprot.gaf.gz'}
});
const normalizedId=x=>String(x||'').replace(/\.\d+(?=_PAR_Y$|$)/,'');
const isGeneId=x=>/^ENSG[A-Z0-9]+(?:_PAR_Y)?$/.test(normalizedId(x));
const finiteNumber=(x,label)=>{
 const v=Number(x);if(!Number.isFinite(v)||v<0||v>1e9||x==='')throw new TypeError('invalid '+label);
 return v;
};
async function sha256File(path){
 const hash=createHash('sha256');
 for await(const part of createReadStream(path))hash.update(part);
 return hash.digest('hex');
}
async function verifyFile(path,sha256,label){
 if(typeof path!=='string'||!path||path.length>700)
  throw new TypeError(label+' local file required');
 if(typeof sha256!=='string'||!/^[a-f0-9]{64}$/i.test(sha256))
  throw new TypeError(label+' SHA-256 of downloaded source required');
 const actual=await sha256File(path);
 if(actual.toLowerCase()!==sha256.toLowerCase())throw new Error(label+' SHA-256 mismatch');
 return actual;
}
// Readline's event-driven line queue can grow unbounded when gzip inflates
// gigabytes faster than asynchronous record processing. Pull stream chunks
// directly: every yield applies backpressure to the compressed input.
async function* textLines(path){
 const raw=createReadStream(path,{highWaterMark:65536});
 const stream=path.endsWith('.gz')?raw.pipe(createGunzip({chunkSize:65536})):raw;
 let carry='';
 try{
  for await(const chunk of stream){
   carry+=chunk.toString('utf8');
   let end;
   while((end=carry.indexOf('\n'))!==-1){
    let line=carry.slice(0,end);
    carry=carry.slice(end+1);
    if(line.endsWith('\r'))line=line.slice(0,-1);
    if(line.length>500000)throw new RangeError('source row too large');
    yield line;
   }
   if(carry.length>500000)throw new RangeError('source row too large');
  }
  if(carry.length){
   if(carry.endsWith('\r'))carry=carry.slice(0,-1);
   yield carry;
  }
 }finally{stream.destroy();raw.destroy();}
}
function gtfAttributes(s){
 const out={};
 const reg=/([a-zA-Z][\w-]*)\s+"([^"]*)";/g;let m;
 while((m=reg.exec(s))!==null){
  // Multiple optional annotation keys (tag, ontology, annotations) may
  // repeat. Identity fields must not contain conflicting values.
  if(Object.hasOwn(out,m[1])){
   if(['gene_id','gene_name','gene_type','transcript_id','transcript_type']
     .includes(m[1])&&out[m[1]]!==m[2])
    throw new Error('conflicting GTF identity attribute: '+m[1]);
   continue;
  }
  out[m[1]]=m[2];
 }
 return out;
}
function initGene(id,attr,chr,start,end,strand){
 if(!isGeneId(id)||!attr.gene_name||!attr.gene_type)
  throw new Error('missing GENCODE gene identification');
 return {ensembl_gene_id:id,symbol:attr.gene_name,biotype:attr.gene_type,
  chr,start,end,strand,transcripts:[],brain_median_tpm:{},
  go_terms:[],go_terms_dropped:0};
}
export async function loadGencodeGenes(path,{max_genes=120000,max_transcripts=1000000}={}){
 const genes=new Map(),pending=new Map(),seenTranscript=new Set();
 let lines=0,transcripts=0,ignored=0,pendingCount=0;
 for await(const line of textLines(path)){
  if(line.startsWith('#')||!line.trim())continue;
  if(++lines>20000000)throw new RangeError('annotation line count exceeds research budget');
  if(lines%2000000===0&&process.env.GITHUB_ACTIONS==='true')
   process.stderr.write('[AURA GTF] '+lines+' features, '+genes.size+
    ' genes, '+transcripts+' transcripts; heap='+
    Math.round(process.memoryUsage().heapUsed/1048576)+' MB\\n');
  const cols=line.split('\t');
  if(cols.length!==9)throw new Error('GTF requires nine columns');
  if(cols[2]!=='gene'&&cols[2]!=='transcript')continue;
  const attr=gtfAttributes(cols[8]),geneId=normalizedId(attr.gene_id);
  const chr=cols[0],start=Number(cols[3]),end=Number(cols[4]);
  if(!Number.isSafeInteger(start)||start<1||!Number.isSafeInteger(end)||end<start||
    (cols[6]!=='+'&&cols[6]!=='-')||chr.length>40)
   throw new Error('invalid GTF gene coordinates');
  if(!isGeneId(geneId)){ignored++;continue;}
  if(cols[2]==='gene'){
   if(genes.has(geneId))throw new Error('duplicate GENCODE gene '+geneId);
   if(genes.size>=max_genes)throw new RangeError('too many genes');
   const gene=initGene(geneId,attr,chr,start,end,cols[6]);
   genes.set(geneId,gene);
   const backlog=pending.get(geneId);
   if(backlog){gene.transcripts.push(...backlog);pendingCount-=backlog.length;
    pending.delete(geneId);}
  }else{
   const transcriptId=attr.transcript_id;
   if(!transcriptId||transcriptId.length>70||seenTranscript.has(transcriptId))
    throw new Error('missing or duplicate isoform identifier');
   seenTranscript.add(transcriptId);
   if(++transcripts>max_transcripts)throw new RangeError('too many isoforms');
   const isoform={id:transcriptId,biotype:attr.transcript_type||'unclassified'};
   const gene=genes.get(geneId);
   if(gene)gene.transcripts.push(isoform);
   else{
    if(++pendingCount>100000)throw new RangeError('out-of-order GTF transcript budget');
    const backlog=pending.get(geneId)||[];backlog.push(isoform);
    pending.set(geneId,backlog);
   }
  }
 }
 return {genes,parsed_genes:genes.size,parsed_transcripts:transcripts,
  orphan_transcripts:pendingCount,ignored_unrecognized_ids:ignored};
}
export async function joinGtexBrainExpression(path,genes){
 if(!(genes instanceof Map))throw new TypeError('gene map required');
 let lineNumber=0,columns=null,selected=[],matched=0,unmatched=0,records=0;
 const seen=new Set();
 for await(const line of textLines(path)){
  lineNumber++;
  if(lineNumber===1){
   if(!/^#1\.[23]$/.test(line.trim()))throw new Error('GTEx GCT version missing');
   continue;
  }
  if(lineNumber===2){
   if(!/^\d+\s+\d+$/.test(line.trim()))throw new Error('GCT matrix shape missing');
   continue;
  }
  if(lineNumber===3){
   columns=line.split('\t');
   if(columns[0]!=='Name'||columns[1]!=='Description')
    throw new Error('GCT header requires Name and Description');
   selected=columns.map((name,i)=>({name,i})).filter(x=>/^Brain - /i.test(x.name));
   if(selected.length<2)throw new Error('GTEx brain tissue columns missing');
   continue;
  }
  if(!columns)throw new Error('GTEx header missing');
  if(++records>130000)throw new RangeError('GTEx row budget');
  const cols=line.split('\t');
  if(cols.length!==columns.length)throw new Error('GTEx column count invalid');
  const id=normalizedId(cols[0]);
  if(!isGeneId(id))continue;
  if(seen.has(id))throw new Error('duplicate GTEx gene id '+id);
  seen.add(id);
  const gene=genes.get(id);
  if(!gene){unmatched++;continue;}
  const values={};
  for(const {name,i} of selected)values[name]=finiteNumber(cols[i],'GTEx TPM');
  gene.brain_median_tpm=values;
  matched++;
 }
 return {matched_genes:matched,unmatched_gt_ex_genes:unmatched,
  gct_records:records,brain_tissues:selected.map(x=>x.name),
  measurement:'median-bulk-tissue-TPM-not-cell-specific-or-protein'};
}
export async function joinGoaHumanFunctions(path,genes,{max_terms_per_gene=48}={}){
 if(!(genes instanceof Map))throw new TypeError('gene map required');
 if(!Number.isInteger(max_terms_per_gene)||max_terms_per_gene<1||max_terms_per_gene>512)
  throw new RangeError('GO term budget');
 // GAF symbol is not a globally unique gene ID. Never join ambiguous symbols.
 const bySymbol=new Map(),ambiguous=new Set();
 for(const gene of genes.values()){
  if(bySymbol.has(gene.symbol)){ambiguous.add(gene.symbol);continue;}
  bySymbol.set(gene.symbol,gene);
 }
 for(const x of ambiguous)bySymbol.delete(x);
 const seen=new Set();let rows=0,linked=0,unknown=0,negative=0,truncated=0;
 for await(const line of textLines(path)){
  if(line.startsWith('!')||line.startsWith('#')||!line.trim())continue;
  if(++rows>10000000)throw new RangeError('GO annotation row budget');
  const c=line.split('\t');
  if(c.length<15)throw new Error('GAF requires at least 15 columns');
  const [db,uniprot,symbol,qualifier,term,reference,evidence,,aspect,,,,
   taxon]=c;
  if(!taxon?.split('|').includes('taxon:9606')||!/^GO:\d{7}$/.test(term)||
   !['F','P','C'].includes(aspect))continue;
  if((qualifier||'').split('|').includes('NOT')){negative++;continue;}
  if(evidence==='ND')continue;
  const gene=bySymbol.get(symbol);
  if(!gene||gene.biotype!=='protein_coding'){unknown++;continue;}
  // A gene's GO term can have many independent references. Preserve
  // evidence code and one reference, never count it as proven phenotype.
  const key=gene.ensembl_gene_id+'|'+term+'|'+aspect;
  if(seen.has(key))continue;
  seen.add(key);linked++;
  if(gene.go_terms.length>=max_terms_per_gene){
   gene.go_terms_dropped++;truncated++;continue;
  }
  gene.go_terms.push({go_id:term,aspect,evidence,
   reference:reference||null,assigned_to:db+':'+uniprot});
 }
 return {annotated_genes:[...genes.values()].filter(g=>g.go_terms.length>0).length,
  unique_functional_associations:linked,negative_annotations_excluded:negative,
  unknown_or_ambiguous_symbols:unknown,ambiguous_symbols:ambiguous.size,
  associations_truncated:truncated,
  evidence_labels_not_experimental_fits:true};
}
export async function compileHumanGeneAtlas({
 gtf_path,gtf_sha256,gct_path,gct_sha256,gaf_path,gaf_sha256,
 min_genes=50000,min_protein_coding=18000,min_expression_overlap=16000,
 min_go_annotated=5000,max_terms_per_gene=48,
 allow_incomplete=false
}={}){
 const paths=[['GENCODE',gtf_path,gtf_sha256],['GTEx',gct_path,gct_sha256],
  ['GOA',gaf_path,gaf_sha256]];
 const sha={};
 for(const [name,path,hash] of paths)sha[name]=await verifyFile(path,hash,name);
 const indexed=await loadGencodeGenes(gtf_path);
 const expr=await joinGtexBrainExpression(gct_path,indexed.genes);
 const functional=await joinGoaHumanFunctions(gaf_path,indexed.genes,{max_terms_per_gene});
 const genes=[...indexed.genes.values()].sort((a,b)=>
  a.ensembl_gene_id.localeCompare(b.ensembl_gene_id));
 const coding=genes.filter(x=>x.biotype==='protein_coding').length;
 const withTranscripts=genes.filter(x=>x.transcripts.length>0).length;
 const thresholds={genes:min_genes,protein_coding:min_protein_coding,
  expression_overlap:min_expression_overlap,go_annotated:min_go_annotated};
 for(const [name,min] of Object.entries(thresholds))
  if(!Number.isSafeInteger(min)||min<1||min>120000)
   throw new RangeError('invalid minimum '+name);
 const actual={genes:genes.length,protein_coding:coding,
  expression_overlap:expr.matched_genes,go_annotated:functional.annotated_genes};
 const below=Object.keys(thresholds).filter(k=>actual[k]<thresholds[k]);
 const officialMinimum={genes:50000,protein_coding:18000,
  expression_overlap:16000,go_annotated:5000};
 const officialBelow=Object.keys(officialMinimum)
  .filter(k=>actual[k]<officialMinimum[k]);
 if(below.length&&!allow_incomplete)throw new Error(
  'Incomplete source coverage: '+below.map(k=>k+': '+actual[k]+'/'+thresholds[k]).join('; '));
 return {
  schema:HUMAN_GENE_ATLAS_SCHEMA,annotation_assembly:'GRCh38.p14',assembly_stated_by_source_selection_not_sequence_alignment:true,
  sources:HUMAN_GENE_SOURCES,source_sha256:sha,
  checksum_scope:'compares-to-caller-supplied-hash-not-independent-upstream-authenticity',
  genes,counts:{...actual,genes_with_transcript:withTranscripts,
   transcript_isoforms:indexed.parsed_transcripts,orphan_transcripts:indexed.orphan_transcripts,
   ...expr,...functional},minimum_coverage:thresholds,below_minimum:below,
  complete_source_coverage_gate_passed:below.length===0&&officialBelow.length===0,
  official_minimums:officialMinimum,official_coverage_gaps:officialBelow,
  all_genes_biologically_functional:false,
  cell_specific_transcriptomics_embedded:false,
  neural_function_from_GO_proven:false,
  human_genome_executed:false,whole_human_brain_equivalence:false,
  production_activation:false};
}
export async function writeHumanGeneAtlas(atlas,out_path){
 if(atlas?.schema!==HUMAN_GENE_ATLAS_SCHEMA)throw new TypeError('compiled atlas required');
 if(typeof out_path!=='string'||!out_path.endsWith('.json.gz')||out_path.length>700)
  throw new TypeError('use compressed .json.gz output');
 const payload=gzipSync(Buffer.from(JSON.stringify(atlas)),{level:9});
 if(payload.length>50000000)throw new RangeError('source artifact exceeds 50 MB');
 await writeFile(out_path,payload,{flag:'wx',mode:0o600});
 return {path:out_path,bytes:payload.length,sha256:createHash('sha256').update(payload).digest('hex'),
  count:atlas.counts.genes,production_activation:false};
}
