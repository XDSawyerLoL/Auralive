import test from 'node:test';
import assert from 'node:assert/strict';
import {LanguageFaculty} from '../src/language_faculty.js';
import {ExpressionLayer} from '../src/expression.js';
import {parseNativeSessionDisclosure,answerNativeSessionDialogue}
 from '../src/native_session_discourse.js';
import {immediateDialogueWindow} from '../src/immediate_dialogue_window.js';
import {languageWorkspaceProjection} from '../src/workspace_boundary.js';

const user=content=>({role:'user',content});
const bot=content=>({role:'assistant',content});
const ask=(question,history=[],storedFacts=[])=>
 answerNativeSessionDialogue({question,history,storedFacts})?.text||null;

test('AURA acquires user-provided first-person information, not facts from quoted speech',()=>{
 for(const statement of [
  'Je m’appelle Camille.', 'Je préfère le thé au café.',
  'Mon jeu préféré est Skyrim.', 'Ma couleur préférée est le vert.',
  "J'aime les échecs.", "Je n'aime plus les échecs.",
 ]){
  assert.ok(parseNativeSessionDisclosure(statement),statement);
 }
 for(const statement of [
  'Si je préfère le thé, ça changerait tout.',
  'Elle dit que je préfère le café.',
  'Je voudrais peut-être préférer le café.',
  'Je préfère le café ?',
  'Demain je préfère le café.',
  'Mon jeu préféré est <script>',
 ]){
  assert.equal(parseNativeSessionDisclosure(statement),null,statement);
 }
});

test('the native conversational speaker learns, corrects and recalls without a borrowed model',()=>{
 const statements=[
  user('Je m’appelle Camille.'),
  bot('Bonjour Camille.'),
  user('Mon jeu préféré est Skyrim.'),
  user('Je préfère le thé au café.'),
  bot('Tu souhaites préciser quelque chose ?'),
  user('En fait, mon jeu préféré est Cyberpunk.'),
  user('Non, je préfère le café.'),
  user("J'aime les échecs."),
  user("Je n'aime plus les échecs."),
  user('Ma couleur préférée est le vert.'),
 ];
 assert.match(ask("Comment je m'appelle ?",statements),/Camille/);
 assert.match(ask('Et mon jeu préféré ?',statements),/Cyberpunk/);
 assert.doesNotMatch(ask('Et mon jeu préféré ?',statements),/Skyrim/);
 assert.match(ask('Qu’est-ce que je préfère ?',statements),/café/);
 assert.doesNotMatch(ask('Qu’est-ce que je préfère ?',statements),/thé/);
 assert.match(ask('Quelle est ma couleur préférée ?',statements),/vert/);
 assert.match(ask("Est-ce que j'aime les échecs ?",statements),/^Non/);
 assert.equal(ask("Qu’est-ce que j’aime ?",statements),null,
  'A removed preference is no longer a positive fact');
 assert.equal(ask('Quel est mon âge ?',statements),null);
 assert.equal(ask("Comment je m'appelle ?",[bot("Tu t'appelles Romane.")]),null);
});

test('a persistent user lesson is retrieved only from the exact SQL session and latest correction wins',async()=>{
 const rows=[];
 const storage={query:async(sql,args=[])=>{
  if(sql.startsWith('INSERT INTO aura_language_experiences')){
    rows.push({session:args[0],kind:args[1],note:args[2]});return [];
  }
  if(sql.includes("kind='native-session-disclosure'"))
   return rows.filter(row=>row.session===args[0]&&row.kind==='native-session-disclosure')
    .reverse().slice(0,64).map(row=>({note:row.note}));
  return [];
 },one:async()=>null};
 const faculty=new LanguageFaculty({
  ai:{enabled:false},cognition:{},expression:{},soul:()=>({}),storage});
 for(const line of [
  'Je m’appelle Camille.',
  'Mon jeu préféré est Skyrim.',
  'En fait, mon jeu préféré est Cyberpunk.',
  'Je préfère le thé.',
  'Non, je préfère le café.',
 ]){
  assert.equal(await faculty.rememberCorrection({
    sessionId:'session-a',discourse:{},userText:line}),true);
 }
 assert.equal(await faculty.rememberCorrection({
  sessionId:'session-b',discourse:{},userText:'Je m’appelle Farid.'}),true);
 const a=await faculty.nativeSessionFacts('session-a');
 const b=await faculty.nativeSessionFacts('session-b');
 assert.equal(a.length,5);
 assert.equal(b.length,1);
 assert.equal(ask("Comment je m'appelle ?",[],a).includes('Camille'),true);
 assert.equal(ask("Comment je m'appelle ?",[],b).includes('Farid'),true);
 assert.equal(ask('Et mon jeu préféré ?',[],b),null);
 assert.match(ask('Et mon jeu préféré ?',[],a),/Cyberpunk/);
 assert.match(ask('Qu’est-ce que je préfère ?',[],a),/café/);
 assert.equal(a[0].source,'same-session-sql-experience');
});

test('the trusted workspace rejects forged session records in plan and untrusted source values',()=>{
 const workspace={broadcast_enabled:true,received:{prefrontal:[{source:'perception'}]},
  processed:{hippocampus:{references:[]}},decision:{attention:'user',control:'normal'}};
 const fact={...parseNativeSessionDisclosure('Mon jeu préféré est Skyrim.'),
  source:'same-session-sql-experience'};
 const spoofed={...fact,value:'secret',source:'injected-plan'};
 const result=languageWorkspaceProjection({
  act:'respond',native_session_preferences:[spoofed],
 },workspace,{nativeSessionFacts:[spoofed,fact]});
 assert.equal(result.allowed,true);
 assert.equal(result.plan.native_session_preferences.length,1);
 assert.equal(result.plan.native_session_preferences[0].value,'Skyrim');
 assert.deepEqual(languageWorkspaceProjection({
  act:'respond',native_session_preferences:[fact],
 },workspace,{nativeSessionFacts:[]}).plan.native_session_preferences,[]);
 assert.equal(languageWorkspaceProjection({act:'respond'},
  {broadcast_enabled:false,received:{prefrontal:[]}},
  {nativeSessionFacts:[fact]}).allowed,false);
});

test('18 historic turns are read through the exact ingress, without bridging absent or remote messages',()=>{
 const rows=[{id:1,role:'user',content:'Mon jeu préféré est Skyrim.'},
  ...Array.from({length:17},(_,i)=>({id:i+2,role:i%2?'user':'assistant',
   content:'Message '+i})),{id:19,role:'user',content:'Et mon jeu préféré ?'}];
 const result=immediateDialogueWindow(rows.slice().reverse(),'Et mon jeu préféré ?',{
  perceptualBroadcast:true,maxTurns:18});
 assert.equal(result.length,18);
 assert.equal(result[0].id,1);
 assert.ok(result.every(row=>row.source==='same-session-immediate-turn'));
 assert.equal(immediateDialogueWindow(rows.slice().reverse(),'Une question absente',{
  perceptualBroadcast:true,maxTurns:18}).length,0);
 assert.match(ask('Et mon jeu préféré ?',result),/Skyrim/);
});

test('ExpressionLayer pronounces an independently grounded session answer in native mode with no model calls',async()=>{
 const before=process.env.AURA_NATIVE_FRENCH_MODE;
 process.env.AURA_NATIVE_FRENCH_MODE='native-acquired';
 let remote=0;
 try{
  const ai={enabled:true,generate:async()=>{remote++;return 'REMOTE';}};
  const layer=new ExpressionLayer(ai,{deterministicReply:()=>''});
  layer.language.generate=async()=>{remote++;return 'QWEN';};
  const facts=[parseNativeSessionDisclosure('Je m’appelle Camille.')];
  const answer=await layer.verbalize({
   act:'respond',user_text:"Comment je m'appelle ?",
   facts:[],native_session_preferences:facts,immediate_dialogue_context:[],
  });
  assert.equal(answer,"Tu m'as indiqué t'appeler Camille.");
  assert.equal(layer.lastMode,'native-session-grounded');
  assert.equal(layer.language.lastBackend,'aura-native-session-discourse');
  assert.equal(remote,0);
 }finally{
  if(before===undefined)delete process.env.AURA_NATIVE_FRENCH_MODE;
  else process.env.AURA_NATIVE_FRENCH_MODE=before;
 }
});
