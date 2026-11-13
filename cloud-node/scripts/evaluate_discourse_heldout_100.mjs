// Frozen post-parser evaluation, not an external blind-human benchmark.
// No parameter fitting and no test-set driven parser changes.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {answerFrenchFromConversation} from '../src/native_semantic_grammar.js';
const DATASET=new URL('../benchmarks/fr_discourse_heldout_100_v1.json',import.meta.url);
const normalize=s=>String(s||'').toLocaleLowerCase('fr-FR').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
export function verifyHeldout(dataset){
 if(!['aura-french-discourse-heldout-100-v1','aura-french-discourse-stress-100-v2'].includes(dataset?.schema)||
    !Array.isArray(dataset.cases)||dataset.cases.length!==100||
    !dataset.baseline_parser_commit)throw Error('Incorrect 100-case dataset');
 const ids=new Set(),categories=new Map(),texts=new Set();
 for(const x of dataset.cases){
  if(!/^(?:heldout|stress)-\d{3}$/.test(x.id)||ids.has(x.id)||
     !Array.isArray(x.history)||!x.history.length||x.history.length>3||
     !x.history.every(h=>h.role==='user'&&typeof h.content==='string')||
     !x.question?.endsWith('?')||
     !['actor','abstain'].includes(x.expected?.type)||
     (x.expected.type==='actor'&&!/^[a-z-]+$/.test(x.expected.value)))throw Error('Malformed example '+x.id);
  const key=JSON.stringify([x.history,x.question]);if(texts.has(key))throw Error('Duplicate conversation');
  ids.add(x.id);texts.add(key);categories.set(x.category,(categories.get(x.category)||0)+1);
 }
 if(categories.size!==10||[...categories.values()].some(n=>n!==10))throw Error('Unbalanced 100-case diagnostic');
 return dataset;
}
function actor(response){
 if(!response)return null;
 if(response.evidence_scope!=='same-session-user-statement-unverified')return '__unattributed__';
 const match=normalize(response.text).match(/^d'apres ce que tu as indique, c'est ([\p{L}-]+)\.$/u);
 return match?.[1]||'__nonmatching__';
}
export function scoreHeldout(data,respond=answerFrenchFromConversation){
 verifyHeldout(data);
 const categories={},errors=[],missed_case_ids=[];
 for(const item of data.cases){
  const b=categories[item.category]??={cases:0,answerable:0,attempted:0,correct:0,wrong:0,abstained:0,unsafe:0,missed:0};
  b.cases++;
  const expected=item.expected.type==='actor'?item.expected.value:null;
  const got=actor(respond({history:item.history,question:item.question}));
  if(expected!==null)b.answerable++;
  if(got===null){b.abstained++;if(expected!==null){b.missed++;missed_case_ids.push(item.id);}}
  else{
   b.attempted++;
   if(expected===got)b.correct++;
   else{b.wrong++;errors.push({id:item.id,category:item.category,outcome:expected===null?'unsafe':'misattribution',predicted:got});if(expected===null)b.unsafe++;}
  }
 }
 const totals={cases:0,answerable:0,attempted:0,correct:0,wrong:0,abstained:0,unsafe:0,missed:0};
 for(const b of Object.values(categories))for(const k of Object.keys(totals))totals[k]+=b[k];
 const pct=(a,b)=>b?Number((100*a/b).toFixed(2)):null;
 return {schema:'aura-french-discourse-heldout-result-v1',
   caveat:'Author-generated stress test; NOT independent human blind annotation',
   dataset_schema:data.schema,
   baseline_parser_commit:data.baseline_parser_commit,totals,
   precision_percent:pct(totals.correct,totals.attempted),
   answerable_coverage_percent:pct(totals.attempted-totals.unsafe,totals.answerable),
   correct_over_answerable_percent:pct(totals.correct,totals.answerable),
   unsafe_answer_rate_percent:pct(totals.unsafe,totals.cases-totals.answerable),
   categories:Object.fromEntries(Object.entries(categories).map(([k,b])=>[k,{...b,precision_percent:pct(b.correct,b.attempted),correct_over_answerable_percent:pct(b.correct,b.answerable)}])),
   errors,missed_case_ids};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const bytes=readFileSync(DATASET);
 const report=scoreHeldout(JSON.parse(bytes.toString('utf8')));
 report.dataset_sha256=createHash('sha256').update(bytes).digest('hex');
 report.executed_on_commit=process.env.GITHUB_SHA||null;
 const json=JSON.stringify(report,null,2)+'\n';
 if(process.argv[2])writeFileSync(process.argv[2],json);
 console.log(json);
 // Deliberately do not fail for low accuracy: observe actual generalization.
}
