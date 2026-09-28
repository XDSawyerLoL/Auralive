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

test('AURA pins the Quantic Mairaiy service even if stale Hostinger overrides exist', () => {
  const script = `
    process.env.AURA_VOICE_FABRIC_BASE_URL='https://stale-voice.example.test';
    process.env.AURA_VOICE_FABRIC_PIN_QUANTIC_ENDPOINT='false';
    process.env.AURA_VOICE_FABRIC_STRICT_IDENTITY='false';
    process.env.AURA_MAIRAIY_LANGUAGE='en-us';
    const { VoiceStudioProvider }=await import('./src/voice_fabric.js');
    const { config }=await import('./src/config.js');
    const p=new VoiceStudioProvider();
    console.log(JSON.stringify({
      endpoint:p.endpoint.service_root,
      strict:config.voiceFabricStrictIdentity,
      language:config.voiceFabricLanguage,
      model:config.voiceFabricModel,
      profile:config.voiceFabricProfileName
    }));
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{
    cwd:new URL('..',import.meta.url).pathname,
    encoding:'utf8',
    env:{...process.env},
  });
  assert.equal(result.status,0,result.stderr||result.stdout);
  const payload=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.endpoint,'https://mediumorchid-badger-314305.hostingersite.com/voice');
  assert.equal(payload.strict,true);
  assert.equal(payload.language,'fr-fr');
  assert.equal(payload.model,'kokoro');
  assert.equal(payload.profile,'Mairaiy');
});

test('VoiceStudio synthesis resolves only Mairaiy ff_siwis and sends exact identity', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    delete process.env.AURA_VOICE_FABRIC_API_KEY;

    let seen=null;
    global.fetch=async(url, options={})=>{
      if(String(url).endsWith('/v1/audio/voices')){
        return new Response(JSON.stringify({voices:[
          {voice_id:'wrong',name:'Mairaiy',type:'profile',engine_voice:'af_heart',language:'en'},
          {voice_id:'mairaiy-ff-siwis',name:'Mairaiy',type:'profile',engine_voice:'ff_siwis',language:'fr-fr'}
        ]}),{status:200,headers:{'content-type':'application/json'}});
      }
      seen={
        url:String(url),
        auth:String(options.headers?.Authorization||''),
        body:JSON.parse(String(options.body||'{}'))
      };
      return new Response(Buffer.from('RIFF0000WAVE','ascii'),{
        status:200,
        headers:{
          'content-type':'audio/wav',
          'x-mairaiy-voice':'ff_siwis',
          'x-mairaiy-language':'fr-fr'
        }
      });
    };

    const { VoiceStudioProvider }=await import('./src/voice_fabric.js');
    const p=new VoiceStudioProvider();
    const out=await p.synthesize('Bonjour, je suis Mairaiy.');
    console.log(JSON.stringify({
      enabled:p.enabled,
      seen,
      out:{
        ok:out.ok,
        engine:out.engine,
        voice:out.voice,
        engine_voice:out.engine_voice,
        language:out.language,
        voice_id:out.voice_id,
        model:out.model,
        cost:out.cost_microunits
      }
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
  assert.equal(payload.seen.body.voice,'mairaiy-ff-siwis');
  assert.equal(payload.seen.body.engine_voice,'ff_siwis');
  assert.equal(payload.seen.body.language,'fr-fr');
  assert.equal(payload.out.ok,true);
  assert.equal(payload.out.engine_voice,'ff_siwis');
  assert.equal(payload.out.language,'fr-fr');
  assert.equal(payload.out.voice_id,'mairaiy-ff-siwis');
  assert.equal(payload.out.cost,0);
});

test('VoiceStudio rejects audio that does not certify ff_siwis', () => {
  const script = `
    global.fetch=async(url)=>{
      if(String(url).endsWith('/v1/audio/voices')){
        return new Response(JSON.stringify({voices:[
          {voice_id:'mairaiy',name:'Mairaiy',type:'profile',engine_voice:'ff_siwis',language:'fr-fr'}
        ]}),{status:200,headers:{'content-type':'application/json'}});
      }
      return new Response(Buffer.from('RIFF0000WAVE','ascii'),{
        status:200,
        headers:{'content-type':'audio/wav'}
      });
    };
    const { VoiceStudioProvider }=await import('./src/voice_fabric.js');
    const p=new VoiceStudioProvider();
    try {
      await p.synthesize('Bonjour.');
      console.log(JSON.stringify({ok:true}));
    } catch (error) {
      console.log(JSON.stringify({ok:false,error:String(error?.message||error)}));
    }
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{
    cwd:new URL('..',import.meta.url).pathname,
    encoding:'utf8',
    env:{...process.env},
  });
  assert.equal(result.status,0,result.stderr||result.stdout);
  const payload=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.ok,false);
  assert.match(payload.error,/identity not certified/i);
  assert.match(payload.error,/missing-header/i);
});

test('exact Quantic Mairaiy endpoint remains zero-cost trusted', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    delete process.env.AURA_VOICE_FABRIC_API_KEY;
    delete process.env.AURA_VOICE_FABRIC_ZERO_COST_CONFIRMED;
    const { VoiceStudioProvider }=await import('./src/voice_fabric.js');
    const p=new VoiceStudioProvider();
    const d=p.diagnostic({publicView:true});
    console.log(JSON.stringify({
      enabled:p.enabled,
      endpoint:p.endpoint.service_root,
      trusted:d.zero_cost_trusted_endpoint,
      strict:d.strict_identity,
      expected:d.expected_engine_voice,
      language:d.expected_language,
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
  assert.equal(payload.strict,true);
  assert.equal(payload.expected,'ff_siwis');
  assert.equal(payload.language,'fr-fr');
});
