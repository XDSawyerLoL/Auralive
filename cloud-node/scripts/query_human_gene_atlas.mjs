#!/usr/bin/env node
// Read provenance-backed gene evidence outside AURA live. Example:
// node scripts/query_human_gene_atlas.mjs --atlas atlas.json.gz --sha256 <sha> --gene SCN1A
import {openHumanGeneAtlasArtifact,findHumanGeneEvidence} from '../src/human_gene_evidence_query.js';
const args={};
for(let i=2;i<process.argv.length;i+=2){
 const k=process.argv[i],v=process.argv[i+1];
 if(!['--atlas','--sha256','--gene'].includes(k)||!v||Object.hasOwn(args,k))
  throw new TypeError('Usage: --atlas atlas.json.gz --sha256 saved-artifact-hash --gene HGNC/ENSG');
 args[k]=v;
}
if(Object.keys(args).length!==3)
 throw new TypeError('all atlas hash and gene arguments required');
const atlas=await openHumanGeneAtlasArtifact(args['--atlas'],{sha256:args['--sha256']});
process.stdout.write(JSON.stringify(findHumanGeneEvidence(atlas,args['--gene']))+'\n');
