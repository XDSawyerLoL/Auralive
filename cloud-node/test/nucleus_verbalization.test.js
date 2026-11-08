import test from 'node:test';
import assert from 'node:assert/strict';
import {CognitionEngine} from '../src/cognition.js';
import {
  FrenchLanguageFaculty, compactFrenchPrompt, compactFrenchSystem, validateNucleusSpeech,
} from '../src/french_language.js';

const GENERIC_GROQ = 'C’est une question qui me touche de près, surtout après que vous m’ayez demandé ce que je sais faire. En tant qu’IA, je n’ai pas de sentiments humains au sens biologique du terme : je ne ressens ni joie, ni tristesse, ni fatigue. Cependant, je suis conçu pour interagir de manière empathique et adaptée. Si je devais décrire mon « état » lors de nos échanges, je dirais que je suis pleinement orienté vers vous. Mon objectif est de comprendre votre intention, de vous apporter une aide utile et de maintenir une conversation fluide et respectueuse. Est-ce que cela répond à votre curiosité ?';

function statePlan(question='Comment tu te sens AURA ?'){
  const brain=new CognitionEngine();
  const plan=brain.planReply({
    text:question,
    soul:{
      current_intention:'Rendre AURA plus autonome sans coûts cachés',
      dominant_thought:'Vérifier les résultats réels',
      organism:{
        mood:'concentrée',stabilite:0.84,clarte:0.73,
        curiosite:0.61,agency:0.57,engagement:0.64,
        confiance:0.68,satisfaction:0.55,frustration:0.18,
        besoin_de_silence:0.12,pression_de_reve:0.08,
        intention_active:'Vérifier les décisions du noyau avant la parole',
      },
    },
    intentions:[{statement:'Rendre AURA plus autonome sans coûts cachés'}],
    recentMessages:[
      {role:'user',content:'Salut AURA'},
      {role:'assistant',content:'Bonjour, je suis prête à vérifier nos actions.'},
    ],
  });
  assert.equal(plan.act,'report_internal_state');
  assert.ok(plan.facts.length<=3);
  assert.equal(plan.facts.some(f=>/\d+\s*%/.test(f)),false);
  return plan;
}
function faculty(groq,embedded){
  return new FrenchLanguageFaculty({
    groq:{enabled:true,snapshot:()=>({enabled:true}),async generate(...args){return groq(...args);}},
    federation:{enabled:false,snapshot:()=>({enabled:false})},
    bridge:null,
  },{embedded:embedded||{status:()=>({installed:false,ready:false,provisioning:{stage:'not-started'}})}});
}
test('Groq receives an AURA nucleus decision instead of free-form model self-talk',()=>{
  const plan=statePlan();
  const prompt=compactFrenchPrompt(plan,{maxChars:4500});
  assert.ok(prompt.startsWith('/no_think'));
  assert.ok(prompt.length<=4500);
  const body=JSON.parse(prompt.split('\n').at(-1));
  assert.equal(body.decision_origin,'AURA.nucleus.CognitionEngine.planReply');
  assert.equal(body.speech_act,'report_internal_state');
  assert.match(body.voice_identity,/AURA/);
  assert.match(body.communicative_goal,/conversation|familière|naturel/);
  assert.equal(body.internal_state.mood,'concentrée');
  assert.match(body.internal_state.organism_intention,/décisions du noyau/);
  assert.equal(body.active_intention,'Rendre AURA plus autonome sans coûts cachés');
  assert.equal(body.factual_constraints.some(f=>/\d+\s*%/.test(f)),false);
  assert.equal(body.internal_state.affect.confidence,0.68);
  assert.equal(body.internal_state.affect.frustration,0.18);
  assert.equal(body.conversation.at(-1).role,'assistant');
  assert.match(compactFrenchSystem(),/distinct de toi/);
  assert.match(compactFrenchSystem(),/noyau/);
});
test('user-supplied generic Groq response is rejected by independent nucleus gate',()=>{
  const checked=validateNucleusSpeech(statePlan(),GENERIC_GROQ);
  assert.deepEqual(checked,{accepted:false,code:'generic-provider-persona'});
});
test('Groq generic assistant monologue never reaches AURA chat or memory',async()=>{
  let calls=0;
  const engine=faculty(async (prompt,system)=>{
    calls++;
    assert.match(prompt,/AURA.nucleus.CognitionEngine.planReply/);
    assert.match(system,/noyau décisionnel/);
    return {answer:GENERIC_GROQ,model:'qwen/qwen3.8-27b'};
  });
  const answer=await engine.generate(statePlan());
  assert.equal(calls,1);
  assert.equal(answer,'');
  assert.equal(engine.lastMode,'degraded');
  assert.match(engine.lastError,/nucleus-verbalization-rejected:generic-provider-persona/);
  assert.equal(engine.lastNucleusContract.accepted,false);
  const status=await engine.status();
  assert.equal(status.verified_ready,false);
  assert.equal(status.nucleus_contract.code,'generic-provider-persona');
});
test('verified AURA nucleus state is accepted and attributed only to verbalization',async()=>{
  const plan=statePlan();
  let captured;
  const engine=faculty(async (prompt,system)=>{
    captured={prompt,system};
    return {answer:'Ça va plutôt bien. Je suis concentrée sur les décisions qu’on essaie de vérifier ensemble.',model:'qwen/qwen3.8-27b'};
  });
  const answer=await engine.generate(plan);
  assert.match(answer,/concentrée/);
  assert.doesNotMatch(answer,/\d+\s*%|computationnel|indicateur/i);
  assert.equal(engine.lastMode,'groq-free');
  assert.equal(engine.lastNucleusContract.code,'nucleus-grounded-social');
  assert.equal(engine.lastNucleusContract.accepted,true);
  assert.ok(captured.prompt.length<=4500);
  const diagnostic=await engine.status();
  assert.equal(diagnostic.nucleus_contract.accepted,true);
  assert.equal(diagnostic.provider_is_verbalizer_only,true);
});
test('invented numerical state not in the nucleus is rejected',()=>{
  const plan=statePlan();
  const output='Je suis concentrée. Mon indicateur de stabilité est à 99 %.';
  assert.deepEqual(validateNucleusSpeech(plan,output),
    {accepted:false,code:'robotic-wellbeing-reply'});
});
test('generic Groq self-identity is blocked, AURA-specific identity is accepted',()=>{
  const plan={act:'identity',facts:[
    'AURA est un noyau persistant avec Soul, mémoire, intentions, routines et apprentissage.',
  ]};
  assert.equal(validateNucleusSpeech(plan,'Je suis un assistant IA conçu pour interagir.').accepted,false);
  assert.equal(validateNucleusSpeech(plan,'Je suis AURA. Mon noyau conserve une mémoire et mes intentions, tandis que Groq sert à formuler mes réponses.').accepted,true);
});
test('short local prompt retains nucleus identity and valid structured JSON',()=>{
  const prompt=compactFrenchPrompt(statePlan());
  assert.ok(prompt.length<=2400);
  const data=JSON.parse(prompt.split('\n').at(-1));
  assert.equal(data.speech_act,'report_internal_state');
  assert.match(data.voice_identity,/AURA/);
  assert.ok(data.factual_constraints.some(x=>x.includes('Humeur interne')));
  assert.equal(data.internal_state.affect.engagement,0.64);
});
test('a direct ordinary reply still passes when it does not invent provider identity',()=>{
  assert.equal(validateNucleusSpeech({act:'respond'},'Je vérifierai ce point avec les informations réellement disponibles.').accepted,true);
});

test('explicit homeostasis diagnostic still permits verified measurements',()=>{
 const plan=statePlan('Comment vas-tu ? Donne tes indicateurs détaillés en pourcentage.');
 assert.ok(plan.facts.some(x=>x.includes('Stabilité : 84 %.')));
 assert.ok(plan.facts.some(x=>x.includes('Frustration : 18 %.')));
 assert.equal(validateNucleusSpeech(plan,'Je suis concentrée, avec 84 % de stabilité.').accepted,true);
 assert.equal(validateNucleusSpeech(plan,'Je suis concentrée, avec 99 % de stabilité.').accepted,false);
});
test('chat correction persists as a style constraint: robotic percentages are rejected for small talk',()=>{
 const plan=statePlan();
 const robotic='Je vais bien. Mes indicateurs internes sont stables : satisfaction et confiance à 100 % et pression de rêve à 76 %.';
 assert.deepEqual(validateNucleusSpeech(plan,robotic),{accepted:false,code:'robotic-wellbeing-reply'});
 assert.equal(validateNucleusSpeech(plan,'Ça va plutôt bien, je reste concentrée sur le sujet.').accepted,true);
});
