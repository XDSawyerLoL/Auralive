import test from 'node:test';
import assert from 'node:assert/strict';
import { GroqFreeFaculty } from '../src/groq_free.js';
import { FrenchLanguageFaculty } from '../src/french_language.js';

function freeGroq(fetcher, extra={}) {
  return new GroqFreeFaculty({
    apiKey: 'test-only-secret',
    freePlanConfirmed: true,
    zeroCostMode: true,
    model: 'openai/gpt-oss-20b',
    fetcher, ...extra,
  });
}
const okResponse=(answer='Salut, comment tu vas ?')=>({
  ok:true, status:200, json:async()=>({choices:[{message:{content:answer}}]})
});

test('Groq Free never makes a request without explicit non-billing plan confirmation', async () => {
  let calls=0;
  const invoke=async()=>{calls++;return okResponse();};
  const off=new GroqFreeFaculty({
    apiKey:'test-only-secret', freePlanConfirmed:false, zeroCostMode:true,
    fetcher:invoke, model:'openai/gpt-oss-20b',
  });
  assert.equal(off.enabled,false);
  assert.equal(await off.generate('salut','system'),null);
  assert.equal(calls,0);
  const paidBlocked=new GroqFreeFaculty({
    apiKey:'test-only-secret', freePlanConfirmed:true, zeroCostMode:false,
    fetcher:invoke, model:'openai/gpt-oss-20b',
  });
  assert.equal(await paidBlocked.generate('salut','system'),null);
  assert.equal(calls,0);
});

test('Groq Free blocks unknown and deprecated model IDs without issuing a request', async () => {
  let requests=0;
  const groq=freeGroq(async()=>{requests++;return okResponse();},{model:'llama-3.3-70b-versatile'});
  assert.equal(groq.enabled,false);
  assert.equal(await groq.generate('salut','system'),null);
  assert.equal(requests,0);
});

test('Groq Free sends French faculty messages only to the fixed HTTPS endpoint',async()=>{
  let inspected;
  const groq=freeGroq(async(url,options)=>{
    inspected={url,options};
    return okResponse('Salut !');
  });
  const result=await groq.generate('bonjour','Tu es AURA',180,'french');
  assert.equal(result.answer,'Salut !');
  assert.equal(result.provider,'groq-free');
  assert.equal(inspected.url,'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(JSON.parse(inspected.options.body).model,'openai/gpt-oss-20b');
  assert.equal(JSON.parse(inspected.options.body).messages[1].content,'bonjour');
  assert.equal(groq.snapshot().last_error_code,'');
});

test('non-language role cannot spend the Groq Free chat budget',async()=>{
  let calls=0;
  const groq=freeGroq(async()=>{calls++;return okResponse();});
  assert.equal(await groq.generate('work','system',180,'code'),null);
  assert.equal(calls,0);
});

test('Groq Free local quota reserves slots before awaiting network',async()=>{
  const groq=freeGroq(async()=>okResponse(),{maxRequestsPerDay:1});
  assert.ok(await groq.generate('salut','system'));
  await assert.rejects(()=>groq.generate('salut','system'),/groq-free-local-budget-exhausted/);
  assert.equal(groq.snapshot().process_requests_today,1);
});

test('Groq Free reports auth/rate-limit errors without upstream secret payloads',async()=>{
  const groq=freeGroq(async()=>({
    ok:false,status:429,headers:{get:()=> '25'},
    text:async()=> 'SECRET-SERVER-PAYLOAD',
  }));
  await assert.rejects(()=>groq.generate('salut','system'),/groq-free-rate-limited/);
  assert.equal(groq.snapshot().last_error_code,'groq-free-rate-limited');
  assert.ok(groq.snapshot().cooldown_until);
  assert.doesNotMatch(JSON.stringify(groq.snapshot()),/SECRET-SERVER-PAYLOAD|test-only-secret/);
});

test('Groq Free refuses detected positive cost, then disables itself',async()=>{
  const groq=freeGroq(async()=>({
    ok:true,status:200,
    json:async()=>({usage:{cost:0.01},choices:[{message:{content:'Bon'}}]}),
  }));
  await assert.rejects(()=>groq.generate('salut','system'),/groq-zero-cost-violation/);
  assert.equal(groq.enabled,false);
});

test('French Faculty uses Groq Free before OpenRouter when local model is unavailable',async()=>{
  const visited=[];
  const groq=freeGroq(async()=>{visited.push('groq');return okResponse('Salut, que veux-tu explorer ?')});
  const embedded={status:()=>({installed:false,ready:false}),generate:async()=>{visited.push('embedded');return ''}};
  const faculty=new FrenchLanguageFaculty({
    federation:{enabled:true,snapshot:()=>({enabled:true,zero_cost_mode:true}),generate:async()=>{
      visited.push('openrouter');return{answer:'Autre réponse'};
    }},
    bridge:null,
  },{groq,embedded});
  const text=await faculty.generate({user_text:'salut',goal:'saluer naturellement'});
  assert.equal(text,'Salut, que veux-tu explorer ?');
  assert.deepEqual(visited,['groq']);
  assert.equal(faculty.lastMode,'groq-free');
  assert.equal((await faculty.status()).verified_ready,true);
});

test('French Faculty falls back to OpenRouter on Groq Free rate limits',async()=>{
  const groq=freeGroq(async()=>({ok:false,status:429,headers:{get:()=>''}}));
  const faculty=new FrenchLanguageFaculty({
    federation:{enabled:true,snapshot:()=>({enabled:true,zero_cost_mode:true}),generate:async()=>({answer:'Salut depuis OpenRouter'})},
    bridge:null,
  },{groq,embedded:{status:()=>({installed:false,ready:false})}});
  assert.equal(await faculty.generate({user_text:'salut'}),'Salut depuis OpenRouter');
  assert.equal(faculty.lastMode,'zero-cost-federation');
});

test('AURA does not advertise a working Groq language engine merely because a key exists',async()=>{
  const groq=freeGroq(async()=>({ok:false,status:429,headers:{get:()=>''}}));
  const faculty=new FrenchLanguageFaculty({
    federation:{enabled:false,snapshot:()=>({enabled:false,zero_cost_mode:true})},bridge:null,
  },{groq,embedded:{status:()=>({installed:false,ready:false})}});
  assert.equal(await faculty.generate({user_text:'salut'}),'');
  const status=await faculty.status();
  assert.equal(status.verified_ready,false);
  assert.equal(status.blocking_reason,'groq-free-rate-limited');
});
