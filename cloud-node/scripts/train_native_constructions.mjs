// Offline manual annotation trainer; intentionally no online self-training.
// Usage: node scripts/train_native_constructions.mjs annotations.json snapshot.json
// Input: {"schema":"aura-annotated-language-examples-v1","examples":[
// {"sentence":"...","agent":"...","predicate":"...","patient":"..."}]}
// No external API and no unsafe automatic collection of private dialogues.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {NativeConstructionLearner} from '../src/native_construction_learning.js';
const input=process.argv[2],output=process.argv[3];
if(!input||!output||resolve(input)===resolve(output))
 throw Error('Supply distinct annotation JSON input and output paths');
const bytes=await readFile(resolve(input));
if(bytes.length>2_000_000)throw Error('Annotation limit exceeded');
const dataset=JSON.parse(bytes.toString('utf8'));
if(dataset?.schema!=='aura-annotated-language-examples-v1'||
 !Array.isArray(dataset.examples)||dataset.examples.length<3||
 dataset.examples.length>5000)throw Error('Unsupported annotated dataset');
const learner=new NativeConstructionLearner();
let accepted=0,refused=0;
for(const example of dataset.examples){
 const result=learner.observe(example);
 if(result.accepted)accepted++;else refused++;
}
const snapshot=learner.snapshot();
if(!learner.status().ready)throw Error('No construction acquired from diverse supported annotations');
await writeFile(resolve(output),JSON.stringify(snapshot,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({accepted,refused,status:learner.status(),
 trained_from:'explicit-annotations-not-user-conversation-autolearning',
 source_verification:'annotations-unverified',snapshot_created:true}));
