import test from 'node:test';
import assert from 'node:assert/strict';
import {classifySelfDialogue} from '../src/self_dialogue_intents.js';
import {CognitionEngine} from '../src/cognition.js';
import {selectFounderProfile,founderIdentityDeclarations} from '../src/founder_profile.js';
import {FrenchLanguageFaculty,compactFrenchPrompt,compactFrenchSystem,validateNucleusSpeech} from '../src/french_language.js';
const engine=new CognitionEngine();
const soul={name:'AURA',organism:{mood:'intriguée',confiance:.7176,satisfaction:.6107,
 relationship:{social_curiosity:.5},executive:{}},emergent_identity:{observations:12}};
const note={id:'memo01',namespace:'founder',kind:'fact',project:'profil personnel',
 title:'Identité du fondateur',tags:['identité','fondateur'],source:'fondateur:manuel',
 status:'active',body:'Je m’appelle Camille. Je travaille avec AURA sur son évolution.'};
const project={...note,id:'project02',kind:'project',project:'Quantic',title:'AURA',body:'AURA a une mémoire persistante.'};

test('AURA distinguishes who the person is from who AURA is',()=>{
 for(const q of ['Tu sais qui je suis?','Est-ce que tu sais qui je suis ?',
   'Tu me connais ?', 'Tu te souviens de moi ?', 'Que sais-tu de moi ?',
   'Quel est mon nom ?','Qui suis-je pour toi ?']){
  assert.equal(classifySelfDialogue(q),'user_recognition',q);
  const plan=engine.planReply({text:q,soul,privateView:true,recentMessages:[
    {role:'user',content:'salut'},
    {role:'assistant',content:'Salut.'},
  ]});
  assert.equal(plan.act,'user_recognition',q);
  assert.equal(plan.needs_semantic_support,false);
  assert.ok(plan.goal.includes('LUI'),q);
  assert.match(engine.deterministicReply(plan),/tu es la personne/i);
  assert.doesNotMatch(engine.deterministicReply(plan),/Je suis AURA|mon noyau/i);
 }
 assert.equal(classifySelfDialogue('QUI ES TU?'),'self_identity');
 assert.equal(classifySelfDialogue('Comment t’appelles-tu ?'),'self_name');
 assert.equal(engine.planReply({text:'salut',soul}).act,'greet');
});

test('personal knowledge only comes from attributed notes in founder session',()=>{
 const recognized=selectFounderProfile([project,note],{authenticated:true});
 assert.equal(recognized.length,1);
 assert.match(recognized[0].detail,/Camille/);
 assert.equal(selectFounderProfile([note],{authenticated:false}).length,0);
 assert.deepEqual(selectFounderProfile([{
  ...note,title:'Identité AURA',project:'AURA',tags:['identité'],body:'Je suis AURA.',
 }],{authenticated:true}),[],'an AI identity note is not the founder biography');
 const privatePlan=engine.planReply({text:'Tu sais qui je suis ?',soul,
  privateView:true,founderProfileNotes:[project,note]});
 assert.equal(privatePlan.founder_profile.length,1);
 assert.match(engine.deterministicReply(privatePlan),/Camille/);
 const publicPlan=engine.planReply({text:'Tu sais qui je suis ?',soul,
  privateView:false,founderProfileNotes:[note]});
 assert.deepEqual(publicPlan.founder_profile,[]);
 assert.doesNotMatch(JSON.stringify(publicPlan),/Camille/);
 assert.match(engine.deterministicReply(publicPlan),/Je ne peux pas te reconnaître/);
});

test('a prior explicit name declaration can be recovered from archived founder chat only',()=>{
 const rows=[
  {content:'Je m’appelle Camille, et je développe AURA.'},
  {content:'Je m’appelle un personnage de roman, exemple fictif.'},
 ];
 const found=founderIdentityDeclarations(rows,{authenticated:true});
 assert.equal(found.length,1);
 const profile=selectFounderProfile(found,{authenticated:true});
 assert.match(profile[0].detail,/Camille/);
 assert.deepEqual(founderIdentityDeclarations(rows,{authenticated:false}),[]);
 const unnamed=founderIdentityDeclarations([{content:'Je parle de la personnalité d’AURA'}],{authenticated:true});
 assert.deepEqual(unnamed,[]);
 const plan=engine.planReply({text:'Tu te souviens de moi ?',soul,
  privateView:true,founderProfileNotes:found});
 assert.match(engine.deterministicReply(plan),/Camille/);
});

test('short interpersonal voice payload excludes telemetry, internal fields and verbose identity instructions',()=>{
 const plan=engine.planReply({text:'Tu sais qui je suis ?',soul,
  privateView:true,founderProfileNotes:[note],recentMessages:[
    {role:'user',content:'salut'},{role:'assistant',content:'Salut.'}
  ]});
 const prompt=compactFrenchPrompt(plan,{maxChars:4500});
 const body=JSON.parse(prompt.split('\n').at(-1));
 assert.equal(body.speech_act,'user_recognition');
 assert.equal(body.authenticated_founder,true);
 assert.equal(body.recorded_profile.length,1);
 assert.equal(body.recorded_profile[0].evidence_status,'déclaration attribuée, non vérifiée indépendamment');
 for(const key of ['internal_state','decision_origin','voice_identity','executive_role',
  'active_intention','mood','organism_state','self_model']){
  assert.equal(Object.hasOwn(body,key),false,key);
 }
 assert.doesNotMatch(prompt,/0\.7176|0\.6107|mood:|nucleus_plan_origin/);
 assert.match(compactFrenchSystem(plan),/interlocuteur/);
 assert.ok(prompt.length<=4500);
});

test('independent response gate blocks exactly the failure seen in production',()=>{
 const plan=engine.planReply({text:'Tu sais qui je suis ?',soul,privateView:true});
 const screenshot='Je suis AURA, le noyau décisionnel persistant distinct du modèle externe. '
  +'Mon état intérieur : mood: intriguée avec une confiance de 0,7176 et une satisfaction de 0,6107. '
  +'Mon champ decision_origin et le noyau sont des sources d’autorité.';
 assert.equal(validateNucleusSpeech(plan,screenshot).accepted,false);
 assert.equal(validateNucleusSpeech(plan,'Je suis AURA, ton noyau persistant.').accepted,false);
 assert.equal(validateNucleusSpeech(plan,'Tu es mon fondateur et je garde la trace de nos échanges, mais je ne connais pas encore toute ton histoire.').accepted,true);
 const anonymous=engine.planReply({text:'Tu sais qui je suis ?',soul,privateView:false});
 assert.equal(validateNucleusSpeech(anonymous,'Je te reconnais, tu es mon fondateur.').accepted,false);
 assert.equal(validateNucleusSpeech(anonymous,'Je sais seulement ce que tu me racontes ici, pas qui tu es au-delà.').accepted,true);
 assert.equal(validateNucleusSpeech(plan,'Tu t’appelles Albert.').accepted,false);
 assert.equal(validateNucleusSpeech(plan,'Tu es Albert, je te reconnais.').accepted,false);
 const withProfile=engine.planReply({text:'Tu sais qui je suis ?',soul,
  privateView:true,founderProfileNotes:[note]});
 assert.equal(validateNucleusSpeech(withProfile,'Tu t’appelles Camille, c’est le nom que tu m’as confié.').accepted,true);
});

test('a misaddressed Groq answer is rejected and retried without ever reaching user',async()=>{
 let calls=0;let firstPrompt='';
 const ai={
   groq:{enabled:true,snapshot:()=>({enabled:true}),async generate(prompt,system){
     calls++;if(calls===1)firstPrompt=prompt;
     assert.match(system,/interlocuteur/);
     return {answer:calls===1
       ?'Je suis AURA, le noyau persistant avec une mémoire et une confiance de 0,7176.'
       :'Je sais que tu es la personne avec qui je développe AURA. Mais je préfère ne pas inventer ton histoire.'};
   }},
   federation:{enabled:false,snapshot:()=>({enabled:false})},bridge:null,
 };
 const faculty=new FrenchLanguageFaculty(ai,{embedded:{status:()=>({ready:false,installed:false,
  provisioning:{stage:'not-started'}})}});
 const plan=engine.planReply({text:'Tu sais qui je suis ?',soul,privateView:true});
 const answer=await faculty.generate(plan,{maxTokens:600});
 assert.equal(calls,2);
 assert.match(answer,/tu es la personne/);
 assert.doesNotMatch(answer,/0\.7176|noyau|décisionnel/);
 assert.ok(!firstPrompt.includes('decision_origin'));
 assert.equal(faculty.lastNucleusContract.accepted,true);
});
