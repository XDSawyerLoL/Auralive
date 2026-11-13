// Offline-held-out evaluator: reads independent UD_French-GSD DEV split, NEVER
// trains/updates the model and NEVER stores or prints the dev sentences.
// Reports sentence-level agent/patient/lemma precision among attempts AND recall
// among eligible annotated clauses; coarse template coverage is not accuracy.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {nativeUDConstructions} from '../src/native_ud_constructions.js';

const PINNED_DEV_BLOB='9f712559f8d69dc9d7872b13b4fe6cec2d722f8b';
const file=process.argv[2];
if(!file||!file.endsWith('fr_gsd-ud-dev.conllu'))
  throw Error('Supply pinned untouched UD French-GSD DEV split');
const bytes=await readFile(file);
if(bytes.length<1_000_000||bytes.length>10_000_000)throw Error('Invalid dev split size');
const blobSha=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
if(blobSha!==PINNED_DEV_BLOB)throw Error('Dev split SHA mismatch: refuse benchmark');
if(!nativeUDConstructions.ready)throw Error('Dependency model absent or invalid');
const fold=s=>String(s||'').toLocaleLowerCase('fr-FR')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'")
  .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const includesToken=(phrase,word)=>(' '+fold(phrase)+' ').includes(' '+fold(word)+' ');
const stats={dataset:'UD_French-GSD',split:'dev',dev_blob_sha:blobSha,
  sentences:0,eligible:0,attempted:0,correct:0,abstained:0,incorrect:0,
  active_eligible:0,passive_eligible:0,active_correct:0,passive_correct:0,
  failure_examples_exported:false,training_split_reused:false};
let rows=[],sentence='';
function finish(){
 if(!rows.length)return;
 stats.sentences++;
 const root=rows.filter(t=>t.head===0 && t.pos==='VERB');
 if(root.length!==1||rows.filter(t=>t.pos==='VERB').length!==1||!sentence){rows=[];sentence='';return;}
 const pred=root[0],direct=rows.filter(t=>t.head===pred.id);
 const subj=direct.find(t=>t.rel==='nsubj'||t.rel==='nsubj:pass');
 const obj=direct.find(t=>t.rel==='obj');
 const passer=subj?.rel==='nsubj:pass'||direct.some(t=>t.rel==='aux:pass');
 const by=direct.find(t=>t.rel==='obl:agent');
 const agent=passer?by:subj,patient=passer?subj:obj;
 if(!agent||!patient||!['NOUN','PROPN'].includes(agent.pos)||
    !['NOUN','PROPN'].includes(patient.pos)||
    direct.some(x=>['ccomp','xcomp','advcl'].includes(x.rel))){rows=[];sentence='';return;}
 stats.eligible++;
 if(passer)stats.passive_eligible++;else stats.active_eligible++;
 const output=nativeUDConstructions.parseStatement(sentence);
 if(!output){stats.abstained++;}
 else{
   stats.attempted++;
   const correct=output.predicate===fold(pred.lemma)&&
     output.voice===(passer?'passive':'active')&&
     includesToken(output.agent,agent.form)&&includesToken(output.patient,patient.form);
   if(correct){stats.correct++;if(passer)stats.passive_correct++;else stats.active_correct++;}
   else stats.incorrect++;
 }
 rows=[];sentence='';
}
for(const line of bytes.toString('utf8').split('\n')){
 if(!line.trim()){finish();continue}
 if(line.startsWith('# text = ')){sentence=line.slice(9).trim();continue}
 if(line.startsWith('#'))continue;
 const c=line.split('\t');
 if(c.length!==10||!/^\d+$/.test(c[0]))continue;
 rows.push({id:+c[0],form:c[1],lemma:c[2],pos:c[3],head:+c[6],rel:c[7]});
}
finish();
if(stats.sentences<1200||stats.eligible<40)throw Error('DEV evaluation set unusable');
const precision=stats.attempted?stats.correct/stats.attempted:null;
const recall=stats.correct/stats.eligible;
const coverage=stats.attempted/stats.eligible;
const output={...stats,precision_at_attempt:precision,correct_over_eligible:recall,
  attempt_coverage:coverage,
  caveat:'Strict lexical-head matching on unusually simple DEV sentences; not a general conversational understanding score'};
const json=JSON.stringify(output,null,2)+'\n';
if(process.argv[3])await writeFile(process.argv[3],json,'utf8');
console.log(json);
