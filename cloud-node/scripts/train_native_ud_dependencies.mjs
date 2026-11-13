// Build-time only: train a bounded French syntactic constructor from genuine
// Universal Dependencies French-GSD TRAIN dependency heads, not surface n-grams.
// Requires a legally obtained, pinned, unmodified .conllu file. Never runs in chat.
// No sentences, names or personal text are copied into the compact model.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const INPUT_BLOB_SHA='9a15cb3559ca80bb0942909e48e7a752bbcfb026';
const UPSTREAM_COMMIT='7110d4660ba088b630eb5928a6a1d35523898e05';
const OUTPUT_SCHEMA='aura-ud-french-dependency-constructions-v1';
const input=process.argv[2];
const out=process.argv[3]||resolve(dirname(fileURLToPath(import.meta.url)),
  '../data/fr_ud_dependency_constructions.json');
if(!input||!input.endsWith('fr_gsd-ud-train.conllu'))
  throw Error('Expected the pinned UD French-GSD TRAIN CoNLL-U file');

const raw=await readFile(resolve(input));
if(raw.length<10_000_000||raw.length>90_000_000)throw Error('Invalid corpus size');
const blobSha=createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex');
if(blobSha!==INPUT_BLOB_SHA)
  throw Error('Refusing changed upstream corpus; verify provenance and update source pin intentionally');
const counts=new Map(),edges=new Map(),forms=new Map(),relations=new Map();
let buffer=[],sentences=0,tokens=0,clauses=0,passive=0;
const add=(map,key,n=1)=>map.set(key,(map.get(key)||0)+n);
const left=t=>t<0?'left':t>0?'right':'head';
const clean=s=>String(s||'').toLocaleLowerCase('fr').trim();
const portable=s=>/^[\p{L}'’\-]{1,36}$/u.test(s);
function finish(){
 if(!buffer.length)return;
 sentences++;
 const byId=new Map(buffer.map(t=>[t.id,t]));
 const children=new Map();
 for(const t of buffer){
   const head=byId.get(t.head);
   if(!head)continue;
   if(!children.has(t.head))children.set(t.head,[]);
   children.get(t.head).push(t);
   if(head.pos==='VERB' && t.pos!=='PUNCT'){
     add(edges,[head.pos,t.rel,t.pos,left(t.id-head.id)].join('|'));
   }
 }
 for(const pred of buffer){
   if(pred.pos!=='VERB')continue;
   const ch=children.get(pred.id)||[];
   const subj=ch.find(x=>x.rel==='nsubj'||x.rel==='nsubj:pass');
   if(!subj)continue;
   const obj=ch.find(x=>x.rel==='obj');
   const agent=ch.find(x=>x.rel==='obl:agent');
   const aux=ch.filter(x=>x.pos==='AUX');
   const isPassive=subj.rel==='nsubj:pass'||ch.some(x=>x.rel==='aux:pass')||
     Boolean(agent)||(aux.some(x=>x.lemma==='être' && pred.feats.includes('VerbForm=Part')));
   const key=[
     isPassive?'passive':obj?'active-transitive':'active-intransitive',
     left(subj.id-pred.id),
     obj?left(obj.id-pred.id):'none',
     agent?left(agent.id-pred.id):'none',
   ].join('|');
   add(counts,key);
   clauses++;
   if(isPassive)passive++;
   for(const neg of ch.filter(x=>['ne','pas','jamais','plus'].includes(clean(x.lemma)))){
     add(relations,neg.rel+'|'+clean(neg.lemma));
   }
 }
 buffer=[];
}
for(const line of raw.toString('utf8').split('\n')){
 if(!line.trim()){finish();continue}
 if(line.startsWith('#'))continue;
 const c=line.split('\t');
 if(c.length!==10||!/^([1-9]\d*)$/.test(c[0]))continue;
 const t={id:Number(c[0]),form:clean(c[1]),lemma:clean(c[2]),pos:c[3],
   feats:c[5],head:Number(c[6]),rel:c[7]};
 buffer.push(t);
 tokens++;
 if(t.pos==='VERB'&&portable(t.form)&&portable(t.lemma)){
   add(forms,[t.form,t.lemma].join('|'));
 }
}
finish();
const data={
 schema:OUTPUT_SCHEMA,
 provenance:{
  dataset:'UD_French-GSD',split:'train',commit:UPSTREAM_COMMIT,
  blob_sha:blobSha,license:'CC BY-SA 4.0',
  attribution:'Universal Dependencies UD_French-GSD contributors; https://universaldependencies.org/treebanks/fr_gsd/index.html',
 },
 constraints:'Aggregated dependency structures and verb morphology only; no training sentences copied',
 stats:{sentences,tokens,clauses_with_subject:clauses,passive_clauses:passive},
 // Counts, not manually authored patterns. Direction is relative to VERB.
 constructions:[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])),
 dependency_edges:[...edges].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,2500),
 negation_children:[...relations].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])),
 verb_forms:[...forms].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,8000).map(([key,count])=>[...key.split('|'),count]),
};
if(data.stats.sentences<14000||data.stats.clauses_with_subject<10000||
  !data.constructions.some(([key,n])=>key==='active-transitive|left|right|none'&&n>1000)||
  !data.constructions.some(([key,n])=>key==='passive|left|none|right'&&n>100))
  throw Error('Insufficient dependency evidence: reject unreliable model');
await mkdir(dirname(resolve(out)),{recursive:true});
await writeFile(resolve(out),JSON.stringify(data),'utf8');
console.log(JSON.stringify({sha:blobSha,stats:data.stats,
  patterns:data.constructions.length,verb_forms:data.verb_forms.length,
  output:resolve(out)}));
