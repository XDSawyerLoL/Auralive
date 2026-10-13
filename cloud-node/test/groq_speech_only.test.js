import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAuraSpeechEnvelope,verifyGroqSpeechResponse,GroqSpeechOnly}
  from '../src/groq_speech_only.js';
import {FrenchLanguageFaculty} from '../src/french_language.js';

const plan=()=>({
  user_text:'Salut',
  act:'greet',
  goal:'Saluer brièvement et signaler ma disponibilité.',
  facts:['AURA est disponible pour discuter.'],
  soul:{api_key:'very-secret',memories:['secret memory']},
  experiential_memory:[{private:'personal-data'}],
  tools:[{name:'delete_database'}],
  current_intention:'Confidential operational directive',
  conversation_context:[{content:'Private historical chat'}],
});
const envelope=()=>buildAuraSpeechEnvelope(plan());
const speech=(text)=>({utterance:text,speech_act:'greet',used_fact_ids:['f1']});
const env=()=>({
  NODE_ENV:'test',AURA_ZERO_COST_MODE:'true',
  AURA_GROQ_SPEECH_ENABLED:'true',AURA_GROQ_FREE_PLAN_CONFIRMED:'true',
  AURA_GROQ_API_KEY:'test-key-only',AURA_GROQ_SPEECH_MAX_REQUESTS_PER_DAY:'2',
});

test('Groq sees only AURA speech plan and no memories, tools or arbitrary properties',()=>{
  const serialized=JSON.stringify(envelope());
  assert.deepEqual(Object.keys(envelope()),
    ['speech_act','communicative_goal','user_message','authorized_facts','style']);
  assert.match(serialized,/Salut/);
  for(const secret of ['very-secret','personal-data','delete_database',
    'Private historical chat','Confidential operational directive']){
    assert.doesNotMatch(serialized,new RegExp(secret));
  }
});

test('strict independent verifier rejects altered act, invented facts, actions, URLs and technical output',()=>{
  assert.equal(verifyGroqSpeechResponse(speech('Salut ! Je suis disponible.'),envelope()).ok,true);
  assert.equal(verifyGroqSpeechResponse({...speech('Bonjour'),speech_act:'run_tools'},envelope()).code,'speech-act-modified');
  assert.equal(verifyGroqSpeechResponse({...speech('Bonjour'),used_fact_ids:['f6']},envelope()).code,'speech-facts-invalid');
  assert.equal(verifyGroqSpeechResponse({...speech('Bonjour'),tool_calls:[{name:'delete_db'}]},envelope()).code,'speech-unauthorized-fields');
  assert.equal(verifyGroqSpeechResponse(speech('AURA a traité 892 opérations.'),envelope()).code,'speech-unsupported-number');
  assert.equal(verifyGroqSpeechResponse(speech("J'ai envoyé le rapport."),envelope()).code,'speech-unsupported-action');
  assert.equal(verifyGroqSpeechResponse(speech('User Safety: safe'),envelope()).code,'speech-not-conversational');
  assert.equal(verifyGroqSpeechResponse(speech('Voir https://example.com'),envelope()).code,'speech-unsupported-link');
});

test('no API request without explicit free-plan and zero-cost confirmation',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;throw Error('must not be called')};
  for(const flags of [
    {...env(),AURA_GROQ_SPEECH_ENABLED:'false'},
    {...env(),AURA_GROQ_FREE_PLAN_CONFIRMED:'false'},
    {...env(),AURA_ZERO_COST_MODE:'false'},
    {...env(),AURA_GROQ_API_KEY:''},
  ]){
    const adapter=new GroqSpeechOnly({fetchImpl,env:flags});
    assert.equal(await adapter.generate(plan()),'');
    assert.equal(adapter.status().configured,false);
  }
  assert.equal(calls,0);
});

test('Groq only sends authenticated JSON text request to the fixed endpoint without tools or agent privileges',async()=>{
  const requests=[];
  const adapter=new GroqSpeechOnly({env:env(),fetchImpl:async(url,opts)=>{
    requests.push({url,opts});
    return {ok:true,json:async()=>({choices:[{message:{
      content:JSON.stringify(speech('Salut ! Je suis là.'))
    }}]})};
  }});
  assert.equal(await adapter.generate(plan()),'Salut ! Je suis là.');
  assert.equal(requests.length,1);
  const call=requests[0];
  assert.equal(call.url,'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(call.opts.redirect,'error');
  const payload=JSON.parse(call.opts.body);
  assert.equal(payload.tool_choice,'none');
  assert.equal(payload.stream,false);
  assert.equal(payload.response_format.type,'json_object');
  assert.equal(payload.messages.length,2);
  assert.equal(payload.model,'llama-3.3-70b-versatile');
  assert.equal(payload.messages[1].role,'user');
  assert.deepEqual(JSON.parse(payload.messages[1].content),envelope());
  assert.doesNotMatch(JSON.stringify(payload),/very-secret|delete_database|Private historical chat/);
  assert.equal(adapter.status().mode,'verbalization-only');
  assert.equal(adapter.status().tools_enabled,false);
  assert.equal(adapter.status().memory_write_enabled,false);
  assert.equal(adapter.status().last_error_code,'');
  assert.equal(adapter.status().last_verified_at.length>0,true);
  assert.doesNotMatch(JSON.stringify(adapter.status()),/test-key-only/);
});

test('remote speech cannot claim an action or generate unauthorized numbers',async()=>{
  const adapter=new GroqSpeechOnly({env:env(),fetchImpl:async()=>({
    ok:true,json:async()=>({choices:[{message:{
      content:JSON.stringify(speech("J'ai publié 3 rapports."))
    }}]})
  })});
  assert.equal(await adapter.generate(plan()),'');
  assert.equal(adapter.status().last_error_code,'speech-output-rejected');
  assert.equal(adapter.status().last_rejected_code,'speech-unsupported-number');
});

test('speech client refuses tool-call response and does not retry automatically',async()=>{
  let requests=0;
  const adapter=new GroqSpeechOnly({env:env(),fetchImpl:async()=>{
    requests++;return {ok:true,json:async()=>({choices:[{message:{
      content:JSON.stringify(speech('Salut')),
      tool_calls:[{function:{name:'execute'}}],
    }}]})};
  }});
  assert.equal(await adapter.generate(plan()),'');
  assert.equal(adapter.status().last_error_code,'speech-tool-call-rejected');
  assert.equal(requests,1);
});

test('free plan local cap blocks further requests; never escalates to a paid model',async()=>{
  let requests=0;
  const adapter=new GroqSpeechOnly({env:env(),fetchImpl:async()=>{
    requests++;return {ok:true,json:async()=>({choices:[{message:{
      content:JSON.stringify(speech('Salut !'))
    }}]})};
  }});
  await adapter.generate(plan());
  await adapter.generate(plan());
  assert.equal(await adapter.generate(plan()),'');
  assert.equal(requests,2);
  assert.equal(adapter.status().last_error_code,'speech-daily-cap-reached');
});

test('when Groq is enabled, French expression calls neither local Qwen nor generalized AI',async()=>{
  let localCalls=0,remoteCalls=0,groqCalls=0;
  const embedded={installed:()=>true,canProvision:()=>false,
    generate:async()=>{localCalls++;return 'wrong';},
    status:()=>({ready:true})};
  const groq={enabled:true,generate:async p=>{
    groqCalls++;assert.equal(p.act,'greet');return 'Bonjour, je suis AURA.';},
    status:()=>({enabled:true,configured:true,model:'llama-3.3-70b-versatile',
      last_error_code:''})};
  const ai={federation:{enabled:true,generate:async()=>{remoteCalls++;return {answer:'wrong'};}}};
  const faculty=new FrenchLanguageFaculty(ai,{embedded,groq});
  assert.equal(await faculty.generate(plan()),'Bonjour, je suis AURA.');
  assert.equal(groqCalls,1);
  assert.equal(localCalls,0);
  assert.equal(remoteCalls,0);
  assert.equal(faculty.lastMode,'groq-speech-only');
  const status=await faculty.status();
  assert.equal(status.primary,'groq-speech-only');
  assert.equal(status.verified_ready,true);
});
test('if Groq speech rejects a response no other LLM can silently replace its words',async()=>{
  let localCalls=0,remoteCalls=0;
  const embedded={installed:()=>true,canProvision:()=>true,
    generate:async()=>{localCalls++;return 'wrong';},
    status:()=>({ready:true})};
  const groq={enabled:true,generate:async()=>'',status:()=>({
    enabled:true,configured:true,model:'llama-3.3-70b-versatile',
    last_error_code:'speech-output-rejected'})};
  const ai={federation:{enabled:true,generate:async()=>{remoteCalls++;return {answer:'wrong'};}}};
  const faculty=new FrenchLanguageFaculty(ai,{embedded,groq});
  assert.equal(await faculty.generate(plan()),'');
  assert.equal(localCalls,0);assert.equal(remoteCalls,0);
  assert.equal(faculty.lastError,'speech-output-rejected');
  assert.equal((await faculty.status()).blocking_reason,'speech-output-rejected');
});

test('general cognitive intent without actual answer must never be completed by Groq',async()=>{
  const generic={
    user_text:'Explique la cause de cette panne',
    act:'respond',
    goal:'Répondre utilement au message en restant cohérente avec mon état réel.',
    needs_semantic_support:true,
    facts:['Sujet de l’échange : Explique la cause de cette panne',
      'Intention actuelle : optimiser AURA']
  };
  assert.throws(()=>buildAuraSpeechEnvelope(generic),
    error=>error.message==='speech-plan-insufficient-grounding');
  let calls=0;
  const adapter=new GroqSpeechOnly({env:env(),fetchImpl:async()=>{calls++;throw Error('NO');}});
  assert.equal(await adapter.generate(generic),'');
  assert.equal(adapter.status().last_error_code,'speech-plan-insufficient-grounding');
  assert.equal(calls,0);
  assert.equal(adapter.status().local_requests_today,0);
});
test('explicit cognitive fact content remains eligible to be voiced',()=>{
  const solved={
    user_text:'Combien font 7 + 5 ?',
    act:'solve_symbolic_rule',
    goal:'Communiquer la valeur vérifiée par le noyau.',
    needs_semantic_support:false,
    facts:['La règle calculée et vérifiée donne 7 + 5 = 12.']
  };
  const contract=buildAuraSpeechEnvelope(solved);
  assert.equal(contract.speech_act,'solve_symbolic_rule');
  assert.equal(verifyGroqSpeechResponse({
    speech_act:'solve_symbolic_rule',
    used_fact_ids:['f1'],
    utterance:'Cela fait 12.'
  },contract).ok,true);
});
