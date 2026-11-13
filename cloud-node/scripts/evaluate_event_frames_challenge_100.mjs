// Third evaluation: immutable author-generated challenge, not a human-blind test.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {classifyFrenchEventScope} from '../src/native_event_modality.js';
import {answerFrenchFromConversation} from '../src/native_semantic_grammar.js';
const input=new URL('../benchmarks/fr_event_frames_challenge_100_v1.json',import.meta.url);
const fold=s=>String(s||'').toLocaleLowerCase('fr-FR').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").trim();
export function measureChallenge(data,answer=answerFrenchFromConversation,scope=classifyFrenchEventScope){
 if(data?.schema!=='aura-event-frames-challenge-v1'||!Array.isArray(data.cases)||
    data.cases.length!==100||!data.baseline_parser_commit)throw Error('Malformed fixed challenge');
 const seen=new Set(),categories={};
 const errors=[];
 const totals={cases:0,scope_correct:0,answerable:0,answered:0,correct_answers:0,
   false_answers:0,correct_abstentions:0,missed_answers:0};
 for(const item of data.cases){
  if(seen.has(item.id)||!/^frame-\d{3}$/.test(item.id)||!item.question?.endsWith('?')||
    !Array.isArray(item.history)||item.history.length!==1||
    item.history[0].role!=='user'||!item.expected_scope||
    !['actor','abstain'].includes(item.expected?.type))throw Error('Invalid test case');
  seen.add(item.id);
  const group=categories[item.category]??={cases:0,scope_correct:0,correct_answers:0,false_answers:0,missed_answers:0};
  const predictedScope=scope(item.history[0].content)?.scope;
  const scopeMatches=predictedScope===item.expected_scope;
  if(scopeMatches){totals.scope_correct++;group.scope_correct++;}
  const predicted=answer({history:item.history,question:item.question});
  const expected=item.expected.type==='actor'?item.expected.value:null;
  let got=null;
  if(predicted){
    if(predicted.evidence_scope==='same-session-user-statement-unverified'){
      got=fold(predicted.text).match(/^d'apres ce que tu as indique, c'est ([\p{L}-]+)\.$/u)?.[1]||'__unexpected__';
    }else got='__unattributed__';
  }
  totals.cases++;group.cases++;
  if(expected!==null)totals.answerable++;
  if(got!==null)totals.answered++;
  if(got!==null&&got===expected){totals.correct_answers++;group.correct_answers++;}
  else if(got!==null){totals.false_answers++;group.false_answers++;errors.push({id:item.id,type:'false-answer',predicted:got});}
  else if(expected!==null){totals.missed_answers++;group.missed_answers++;errors.push({id:item.id,type:'missed-answer'});}
  else totals.correct_abstentions++;
  if(!scopeMatches)errors.push({id:item.id,type:'wrong-scope',predicted:predictedScope});
 }
 const pct=(n,d)=>d?Number((100*n/d).toFixed(2)):null;
 return {schema:'aura-event-frames-challenge-result-v1',source:data.source,
  caveat:'The test is authored in-project, so NOT an independent external blind examination',
  baseline_parser_commit:data.baseline_parser_commit,totals,
  scope_accuracy_pct:pct(totals.scope_correct,100),
  answer_precision_pct:pct(totals.correct_answers,totals.answered),
  answerable_coverage_pct:pct(totals.correct_answers,totals.answerable),
  unsafe_rate_pct:pct(totals.false_answers,100-totals.answerable),
  categories,errors};
}
if(process.argv[1]&&process.argv[1]===fileURLToPath(import.meta.url)){
 const raw=readFileSync(input),report=measureChallenge(JSON.parse(raw.toString('utf8')));
 report.dataset_sha256=createHash('sha256').update(raw).digest('hex');
 report.executed_on_commit=process.env.GITHUB_SHA||null;
 const output=JSON.stringify(report,null,2)+'\n';
 if(process.argv[2])writeFileSync(process.argv[2],output);
 console.log(output);
}
