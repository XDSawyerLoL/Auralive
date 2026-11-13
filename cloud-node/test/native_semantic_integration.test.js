import test from 'node:test';
import assert from 'node:assert/strict';
import {ExpressionLayer} from '../src/expression.js';
import {LanguageFaculty} from '../src/language_faculty.js';

test('strict local language responds to grounded question with no Groq call',async()=>{
 const old=process.env.AURA_NATIVE_FRENCH_MODE;
 process.env.AURA_NATIVE_FRENCH_MODE='local-only';
 let remoteCalls=0;
 const ai={enabled:true,generate:async()=>{remoteCalls++;throw Error('REMOTE FORBIDDEN');}};
 const exp=new ExpressionLayer(ai,{deterministicReply:()=>''});
 try{
   const reply=await exp.verbalize({
     act:'respond',
     user_text:'Qui ferme la fenêtre ?',
     facts:[],
     immediate_dialogue_context:[{role:'user',id:1,
       source:'same-session-immediate-turn',content:'Nadia ferme la fenêtre.'}],
   });
   assert.match(reply,/Nadia/);
   assert.equal(exp.lastMode,'native-grammar-grounded');
   assert.equal(exp.language.lastBackend,'aura-native-corpus');
   assert.equal(exp.language.lastNucleusContract.accepted,true);
   assert.equal(remoteCalls,0);
   const unsupported=await exp.verbalize({
     act:'respond',facts:[],user_text:'Explique la cosmologie quantique',
     immediate_dialogue_context:[],
   });
   assert.equal(unsupported,'');
   assert.equal(remoteCalls,0);
 }finally{
   if(old===undefined)delete process.env.AURA_NATIVE_FRENCH_MODE;
   else process.env.AURA_NATIVE_FRENCH_MODE=old;
 }
});

test('language corrections use an isolated persistence partition per session',async()=>{
 const rows=[];
 const storage={
   query:async(sql,args=[])=>{
     if(sql.startsWith('INSERT INTO aura_language_experiences')){
       rows.push({session:args[0],kind:args[1],note:args[2]});return [];
     }
     if(sql.includes('FROM aura_language_experiences')){
       return rows.filter(row=>row.session===args[0]&&row.kind==='native-semantic-correction')
         .reverse().slice(0,10).map(row=>({note:row.note}));
     }
     throw Error('Unexpected SQL');
   },
   one:async()=>null,
 };
 const faculty=new LanguageFaculty({
   ai:{enabled:false},cognition:{},expression:{},soul:()=>({}),storage,
 });
 await faculty.rememberCorrection({
   sessionId:'session-a',discourse:{move:'correction'},
   userText:'Non, le dossier est vert.',
 });
 const a=await faculty.nativeGrammarCorrections('session-a');
 const b=await faculty.nativeGrammarCorrections('session-b');
 assert.equal(a.length,1);
 assert.equal(a[0].frame.patient,'vert');
 assert.deepEqual(b,[]);
});
