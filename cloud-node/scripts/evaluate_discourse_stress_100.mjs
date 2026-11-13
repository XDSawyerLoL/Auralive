// Frozen second-cohort diagnostic: run untouched parser; no training or parameter search.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scoreHeldout} from './evaluate_discourse_heldout_100.mjs';
const path=new URL('../benchmarks/fr_discourse_stress_100_v2.json',import.meta.url);
const bytes=readFileSync(path);
const dataset=JSON.parse(bytes);
if(dataset.schema!=='aura-french-discourse-stress-100-v2'||
   dataset.source!=='fresh-authored-structural-stress-not-external-blind')
   throw Error('Stress benchmark provenance mismatch');
const report=scoreHeldout(dataset);
report.dataset_sha256=createHash('sha256').update(bytes).digest('hex');
report.executed_on_commit=process.env.GITHUB_SHA||null;
const output=JSON.stringify(report,null,2)+'\n';
if(process.argv[2])writeFileSync(process.argv[2],output);
console.log(output);
