// Read-only diagnostic benchmark: no tuning, generation, or training on the labelled cases.
// Its hand-authored labels are NOT an external blind evaluation.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {answerFrenchFromConversation} from '../src/native_semantic_grammar.js';

export const DATASET_PATH=fileURLToPath(new URL('../benchmarks/fr_discourse_diagnostic_v1.json',import.meta.url));
const normalize=s=>String(s||'').toLocaleLowerCase('fr-FR').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();

export function validateDataset(data){
 if(data?.schema!=='aura-french-discourse-diagnostic-v1'||
    data?.source!=='authored-diagnostic-not-external-blind'||
    !Array.isArray(data.cases)||data.cases.length<30)throw Error('Invalid diagnostic dataset');
 const ids=new Set(),categories=new Set();
 for(const item of data.cases){
   if(!/^dialogue-\d{3}$/.test(item?.id)||ids.has(item.id)||
      !/^[a-z_]+$/.test(item.category)||!Array.isArray(item.history)||
      item.history.length<1||item.history.length>4||
      !item.history.every(h=>h.role==='user'&&typeof h.content==='string'&&h.content.length<500)||
      typeof item.question!=='string'||!item.question.endsWith('?')||
      !['actor','abstain'].includes(item.expected?.type)||
      item.expected.type==='actor'&&(!/^[a-z-]+$/.test(item.expected.value)||item.expected.value.length>50)){
     throw Error('Invalid or duplicated item: '+item?.id);
   }
   ids.add(item.id);categories.add(item.category);
 }
 const required=['pronoun_clear','pronoun_ambiguous','relative','temporal','correction','unsafe','multi_event'];
 if(required.some(category=>!categories.has(category)))throw Error('Missing diagnostic category');
 return data;
}
function extractActor(result){
 if(!result||result.evidence_scope!=='same-session-user-statement-unverified')return null;
 const text=normalize(result.text);
 const match=text.match(/^d'apres ce que tu as indique, c'est ([\p{L}-]+)\.$/u);
 return match?.[1]||'__unsupported_answer__';
}
export function evaluateDataset(data,answer=answerFrenchFromConversation){
 validateDataset(data);
 const buckets=new Map();
 const wrongIds=[];
 for(const item of data.cases){
   const answerResult=answer({question:item.question,history:item.history});
   const predicted=extractActor(answerResult);
   const expected=item.expected.type==='actor'?item.expected.value:null;
   let b=buckets.get(item.category);
   if(!b){b={cases:0,answerable:0,attempted:0,correct:0,incorrect:0,abstained:0,unsafe_answers:0};buckets.set(item.category,b)}
   b.cases++;
   if(expected!==null)b.answerable++;
   if(predicted===null)b.abstained++;
   else{
     b.attempted++;
     if(expected===predicted)b.correct++;
     else{b.incorrect++;wrongIds.push(item.id);if(expected===null)b.unsafe_answers++}
   }
 }
 const totals={cases:0,answerable:0,attempted:0,correct:0,incorrect:0,abstained:0,unsafe_answers:0};
 for(const b of buckets.values())for(const field of Object.keys(totals))totals[field]+=b[field];
 const rate=(n,d)=>d===0?null:Number((n/d).toFixed(4));
 return {schema:'aura-discourse-evaluation-v1',dataset:data.schema,
   scope:'hand-authored-fixed-diagnostic-not-independent-blind',
   ...totals,precision_at_attempt:rate(totals.correct,totals.attempted),
   answerable_coverage:rate(totals.attempted-totals.unsafe_answers,totals.answerable),
   correct_over_answerable:rate(totals.correct,totals.answerable),
   unsafe_answer_rate:rate(totals.unsafe_answers,totals.cases-totals.answerable),
   categories:Object.fromEntries([...buckets].map(([name,b])=>[name,{
     ...b,precision_at_attempt:rate(b.correct,b.attempted),
     correct_over_answerable:rate(b.correct,b.answerable)
   }])),wrong_case_ids:wrongIds};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const bytes=readFileSync(DATASET_PATH);
 const data=JSON.parse(bytes.toString('utf8'));
 const result=evaluateDataset(data);
 result.dataset_sha256=createHash('sha256').update(bytes).digest('hex');
 result.commit=process.env.GITHUB_SHA||null;
 const output=JSON.stringify(result,null,2)+'\n';
 if(process.argv[2])writeFileSync(process.argv[2],output);
 console.log(output);
 // Validation checks structural integrity; deliberately DOES NOT fail for model errors.
 // Report regressions through versioned baselines, not by editing cases post-hoc.
}
