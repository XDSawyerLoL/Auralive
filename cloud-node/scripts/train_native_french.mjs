// Build-time ONLY. Converts legally obtained UD French-GSD training split
// into word/POS frequency and morphology data, not copied sentences.
// Usage: node scripts/train_native_french.mjs /path/fr_gsd-ud-train.conllu
//        [output.json]
// This script does no network access. It is never executed during a chat.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const input=process.argv[2];
if(!input||!input.endsWith('.conllu')){
 console.error('Provide a verified UD_French-GSD train .conllu file; no automatic download');
 process.exitCode=2;
}else{
 const target=process.argv[3]||resolve(root,'data/fr_ud_gsd_compact.json');
 const bytes=await readFile(resolve(input));
 if(bytes.length>90_000_000||bytes.length<10000)throw Error('Corpus size outside safe limits');
 const sha=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 const raw=bytes.toString('utf8');
 const forms=new Map(),totals=new Map(),grams=new Map();
 let words=0,sentences=0,sequence=[];
 const end=()=>{
  if(!sequence.length)return;
  sentences++;
  const p=['^','^',...sequence,'$'];
  for(let i=2;i<p.length;i++){
   const k=p.slice(i-2,i+1).join('/');
   grams.set(k,(grams.get(k)||0)+1);
  }
  sequence=[];
 };
 for(const line of raw.split('\n')){
  if(!line.trim()){end();continue}
  if(line[0]==='#')continue;
  const cols=line.split('\t');
  if(cols.length<6||!/^\d+$/.test(cols[0]))continue;
  const [form,lemma,upos,feats]=[cols[1],cols[2],cols[3],cols[5]];
  if(['PUNCT','SYM','X','PROPN'].includes(upos)||!form||!lemma)continue;
  words++;sequence.push(upos);
  totals.set(upos,(totals.get(upos)||0)+1);
  if(form.length>34||lemma.length>34||
    !/^[\p{L}'’\-]+$/u.test(form)||!/^[\p{L}'’\-]+$/u.test(lemma))continue;
  const fv=feats==='_'
    ?'':feats.split('|').filter(x=>/^(Gender|Number|Person|Mood|Tense|VerbForm|PronType|Definite)=/.test(x)).join('|');
  const key=[form.toLocaleLowerCase('fr'),lemma.toLocaleLowerCase('fr'),upos,fv].join('\u0001');
  forms.set(key,(forms.get(key)||0)+1);
 }
 end();
 const entries=[...forms.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
  .slice(0,13000).map(([k,n])=>[...k.split('\u0001'),n]);
 const pos_trigrams=[...grams.entries()].sort((a,b)=>b[1]-a[1])
  .slice(0,900).map(([k,n])=>[k,n]);
 const data={schema:'aura-french-grammar-corpus-v1',
  trained_from:'UD_French-GSD/fr_gsd-ud-train.conllu',
  corpus_sha:sha,license:'CC BY-SA 4.0',
  attribution:'Universal Dependencies UD_French-GSD contributors; https://universaldependencies.org/treebanks/fr_gsd/index.html',
  data_type:'aggregated-lexical-forms-and-pos-gram-patterns-not-sentences',
  sentences_seen:sentences,words_seen:words,
  lexical_patterns_available:forms.size,entries,pos_trigrams,
  pos_totals:Object.fromEntries(totals)};
 await mkdir(dirname(resolve(target)),{recursive:true});
 await writeFile(resolve(target),JSON.stringify(data),'utf8');
 process.stdout.write(JSON.stringify({sentences,words,entries:entries.length,
  pos_grams:pos_trigrams.length,sha})+'\n');
}
