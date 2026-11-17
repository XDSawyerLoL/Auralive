#!/usr/bin/env node
// Local/offline compilation. Never invoke during live server startup.
import {compileHumanGeneAtlas,writeHumanGeneAtlas} from '../src/human_gene_atlas.js';
const args={};
for(let i=2;i<process.argv.length;i+=2){
 const k=process.argv[i],v=process.argv[i+1];
 if(!/^--[a-z0-9-]+$/.test(k)||!v||v.startsWith('--'))
  throw new TypeError('expected --key value pairs');
 if(Object.hasOwn(args,k))throw new Error('duplicate argument '+k);
 args[k]=v;
}
const allowed=new Set(['--gtf','--gtf-sha256','--gct','--gct-sha256',
 '--gaf','--gaf-sha256','--out']);
if(Object.keys(args).some(x=>!allowed.has(x))||[...allowed].some(x=>!args[x]))
 throw new TypeError('Usage: node scripts/compile_human_gene_atlas.mjs --gtf file.gtf.gz --gtf-sha256 sha256 --gct GTEx.gct.gz --gct-sha256 sha256 --gaf GOA.gaf.gz --gaf-sha256 sha256 --out atlas.json.gz');
const atlas=await compileHumanGeneAtlas({
 gtf_path:args['--gtf'],gtf_sha256:args['--gtf-sha256'],
 gct_path:args['--gct'],gct_sha256:args['--gct-sha256'],
 gaf_path:args['--gaf'],gaf_sha256:args['--gaf-sha256'],
});
const result=await writeHumanGeneAtlas(atlas,args['--out']);
// The output is a document of measured/annotated genes, not an executable genome.
// The hashes alone do not establish upstream identity; archive source URLs + dates.
process.stdout.write(JSON.stringify({counts:atlas.counts,artifact:result,
 source_sha256:atlas.source_sha256,
 complete_source_coverage_gate_passed:atlas.complete_source_coverage_gate_passed,
 humans_genome_executed:false,production_deployed:false})+'\n');
