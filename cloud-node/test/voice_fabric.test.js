import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { normalizeVoiceStudioEndpoint } from '../src/voice_fabric.js';

test('Voice Fabric only trusts HTTPS remotely and loopback HTTP locally', () => {
  assert.equal(normalizeVoiceStudioEndpoint('https://voice.example.com').trusted, true);
  assert.equal(normalizeVoiceStudioEndpoint('https://voice.example.com/v1').api_base, 'https://voice.example.com/v1');
  assert.equal(normalizeVoiceStudioEndpoint('http://127.0.0.1:3900').trusted, true);
  assert.equal(normalizeVoiceStudioEndpoint('http://voice.example.com').trusted, false);
});

test('VoiceStudio provider sends OpenAI-compatible WAV request with Mairaiy profile', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AURA_VOICE_FABRIC_ENABLED='true';
    process.env.AURA_VOICE_FABRIC_PIN_QUANTIC_ENDPOINT='false';
    process.env.AURA_VOICE_FABRIC_BASE_URL='https://voice.example.test';
    process.env.AURA_VOICE_FABRIC_API_KEY='secret-test-key';
    process.env.AURA_VOICE_FABRIC_ZERO_COST_CONFIRMED='true';
    process.env.AURA_MAIRAIY_VOICE_PROFILE_ID='profile-mairaiy';
    process.env.AURA_VOICE_FABRIC_MODEL='omnivoice';

    let seen=null;
    global.fetch=async(url, options={})=>{
      seen={url:String(url),auth:String(options.headers?.Authorization||''),body:JSON.parse(String(options.body||'{}'))};
      const wav=Buffer.from('RIFF0000WAVE','ascii');
      return new Response(wav,{status:200,headers:{'content-type':'audio/wav'}});
    };

    const { VoiceStudioProvider }=await import('./src/voice_fabric.js');
    const p=new VoiceStudioProvider();
    const out=await p.synthesize('Bonjour, je suis AURA.');
    console.log(JSON.stringify({enabled:p.enabled,seen,out:{engine:out.engine,voice:out.voice,profile:out.profile,mime:out.mime_type,cost:out.cost_microunits}}));
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('..',import.meta.url).pathname,encoding:'utf8',env:{...process.env}});
  assert.equal(result.status,0,result.stderr||result.stdout);
  const payload=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.enabled,true);
  assert.equal(payload.seen.url,'https://voice.example.test/v1/audio/speech');
  assert.equal(payload.seen.body.model,'omnivoice');
  assert.equal(payload.seen.body.voice,'profile-mairaiy');
  assert.equal(payload.seen.body.response_format,'wav');
  assert.equal(payload.out.engine,'aura-voice-fabric/voicestudio');
  assert.equal(payload.out.voice,'Mairaiy');
  assert.equal(payload.out.cost,0);
  assert.doesNotMatch(JSON.stringify(payload.out),/secret-test-key/);
});

test('zero-cost mode blocks unconfirmed external Voice Fabric', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AURA_VOICE_FABRIC_ENABLED='true';
    process.env.AURA_VOICE_FABRIC_BASE_URL='https://voice.example.test';
    process.env.AURA_VOICE_FABRIC_API_KEY='secret';
    process.env.AURA_VOICE_FABRIC_ZERO_COST_CONFIRMED='false';
    const { VoiceStudioProvider }=await import('./src/voice_fabric.js');
    const p=new VoiceStudioProvider();
    console.log(JSON.stringify(p.diagnostic({publicView:true})));
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('..',import.meta.url).pathname,encoding:'utf8',env:{...process.env}});
  assert.equal(result.status,0,result.stderr||result.stdout);
  const payload=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.enabled,false);
  assert.equal(payload.zero_cost_confirmed,false);
});


test('default Quantic Mairaiy endpoint is allowed in zero-cost mode without API key', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AURA_VOICE_FABRIC_ENABLED='true';
    delete process.env.AURA_VOICE_FABRIC_API_KEY;
    delete process.env.AURA_VOICE_FABRIC_ZERO_COST_CONFIRMED;
    delete process.env.AURA_VOICE_FABRIC_BASE_URL;
    delete process.env.AURA_VOICE_FABRIC_MODEL;
    const { VoiceStudioProvider }=await import('./src/voice_fabric.js');
    const p=new VoiceStudioProvider();
    console.log(JSON.stringify({
      enabled:p.enabled,
      endpoint:p.endpoint.service_root,
      model:p.diagnostic({publicView:true}).model,
      trusted:p.diagnostic({publicView:true}).zero_cost_trusted_endpoint,
    }));
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{
    cwd:new URL('..',import.meta.url).pathname,
    encoding:'utf8',
    env:{...process.env},
  });
  assert.equal(result.status,0,result.stderr||result.stdout);
  const payload=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.enabled,true);
  assert.equal(payload.endpoint,'https://mediumorchid-badger-314305.hostingersite.com/voice');
  assert.equal(payload.model,'kokoro');
  assert.equal(payload.trusted,true);
});

test('arbitrary remote Voice Fabric still requires key and zero-cost confirmation', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AURA_VOICE_FABRIC_ENABLED='true';
    process.env.AURA_VOICE_FABRIC_PIN_QUANTIC_ENDPOINT='false';
    process.env.AURA_VOICE_FABRIC_BASE_URL='https://untrusted-voice.example.test';
    delete process.env.AURA_VOICE_FABRIC_API_KEY;
    delete process.env.AURA_VOICE_FABRIC_ZERO_COST_CONFIRMED;
    const { VoiceStudioProvider }=await import('./src/voice_fabric.js');
    const p=new VoiceStudioProvider();
    console.log(JSON.stringify({
      enabled:p.enabled,
      trusted:p.diagnostic({publicView:true}).zero_cost_trusted_endpoint,
    }));
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{
    cwd:new URL('..',import.meta.url).pathname,
    encoding:'utf8',
    env:{...process.env},
  });
  assert.equal(result.status,0,result.stderr||result.stdout);
  const payload=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.enabled,false);
  assert.equal(payload.trusted,false);
});

test('trusted Mairaiy endpoint emits no Authorization header when no key is configured', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AURA_VOICE_FABRIC_ENABLED='true';
    process.env.AURA_VOICE_FABRIC_BASE_URL='https://mediumorchid-badger-314305.hostingersite.com/voice';
    process.env.AURA_VOICE_FABRIC_MODEL='kokoro';
    delete process.env.AURA_VOICE_FABRIC_API_KEY;
    delete process.env.AURA_VOICE_FABRIC_ZERO_COST_CONFIRMED;

    let seen=null;
    global.fetch=async(url, options={})=>{
      if(String(url).endsWith('/v1/audio/voices')){
        return new Response(JSON.stringify({voices:[{voice_id:'mairaiy',name:'Mairaiy',type:'profile'}]}),{
          status:200,
          headers:{'content-type':'application/json'},
        });
      }
      seen={
        url:String(url),
        auth:options.headers?.Authorization || '',
        body:JSON.parse(String(options.body||'{}')),
      };
      return new Response(Buffer.from('RIFF0000WAVE','ascii'),{
        status:200,
        headers:{'content-type':'audio/wav'},
      });
    };

    const { VoiceStudioProvider }=await import('./src/voice_fabric.js');
    const p=new VoiceStudioProvider();
    const out=await p.synthesize('Bonjour, je suis Mairaiy.');
    console.log(JSON.stringify({
      enabled:p.enabled,
      seen,
      out:{ok:out.ok,model:out.model,voice:out.voice,cost:out.cost_microunits},
    }));
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{
    cwd:new URL('..',import.meta.url).pathname,
    encoding:'utf8',
    env:{...process.env},
  });
  assert.equal(result.status,0,result.stderr||result.stdout);
  const payload=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.enabled,true);
  assert.equal(payload.seen.url,'https://mediumorchid-badger-314305.hostingersite.com/voice/v1/audio/speech');
  assert.equal(payload.seen.auth,'');
  assert.equal(payload.seen.body.model,'kokoro');
  assert.equal(payload.seen.body.voice,'mairaiy');
  assert.equal(payload.out.ok,true);
  assert.equal(payload.out.cost,0);
});


test('stale Hostinger voice override cannot displace verified Quantic Mairaiy by default', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AURA_VOICE_FABRIC_ENABLED='true';
    process.env.AURA_VOICE_FABRIC_BASE_URL='https://stale-voice.example.test';
    delete process.env.AURA_VOICE_FABRIC_PIN_QUANTIC_ENDPOINT;
    delete process.env.AURA_VOICE_FABRIC_API_KEY;
    const { VoiceStudioProvider }=await import('./src/voice_fabric.js');
    const p=new VoiceStudioProvider();
    console.log(JSON.stringify({
      enabled:p.enabled,
      endpoint:p.endpoint.service_root,
      trusted:p.diagnostic({publicView:true}).zero_cost_trusted_endpoint,
    }));
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{
    cwd:new URL('..',import.meta.url).pathname,
    encoding:'utf8',
    env:{...process.env},
  });
  assert.equal(result.status,0,result.stderr||result.stdout);
  const payload=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.enabled,true);
  assert.equal(payload.endpoint,'https://mediumorchid-badger-314305.hostingersite.com/voice');
  assert.equal(payload.trusted,true);
});
