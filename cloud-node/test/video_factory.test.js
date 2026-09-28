import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { VideoFactoryClient, isTrustedVideoFactoryEndpoint } from '../src/video_factory.js';

test('Video Factory trusts HTTPS and loopback HTTP only', () => {
  assert.equal(isTrustedVideoFactoryEndpoint('https://video.example.com'), true);
  assert.equal(isTrustedVideoFactoryEndpoint('http://127.0.0.1:8080'), true);
  assert.equal(isTrustedVideoFactoryEndpoint('http://video.example.com'), false);
  assert.equal(isTrustedVideoFactoryEndpoint('https://user:pass@video.example.com'), false);
});

test('Video Factory creates a bounded zero-cost MoneyPrinter-compatible task', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AURA_VIDEO_FACTORY_ENABLED='true';
    process.env.AURA_VIDEO_FACTORY_BASE_URL='https://video.example.test';
    process.env.AURA_VIDEO_FACTORY_ZERO_COST_CONFIRMED='true';
    process.env.AURA_VIDEO_FACTORY_AUTO_PUBLISH_DISABLED_CONFIRMED='true';
    process.env.AURA_VIDEO_FACTORY_API_KEY='moneyprinter-test-key';

    let seen=null;
    global.fetch=async(url, options={})=>{
      seen={
        url:String(url),
        apiKey:String(options.headers?.['X-API-Key']||''),
        authorization:String(options.headers?.Authorization||''),
        body:JSON.parse(String(options.body||'{}'))
      };
      return new Response(JSON.stringify({data:{task_id:'task-123456'}}), {
        status:200,
        headers:{'content-type':'application/json'}
      });
    };

    const { VideoFactoryClient }=await import('./src/video_factory.js');
    const factory=new VideoFactoryClient();
    const result=await factory.create({
      subject:'Une histoire de robot',
      video_source:'pexels',
      video_aspect:'9:16',
      video_count:9
    });
    console.log(JSON.stringify({enabled:factory.enabled,seen,result}));
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{
    cwd:new URL('..',import.meta.url).pathname,
    encoding:'utf8',
    env:{...process.env}
  });
  assert.equal(result.status,0,result.stderr||result.stdout);
  const payload=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.enabled,true);
  assert.equal(payload.seen.url,'https://video.example.test/api/v1/videos');
  assert.equal(payload.seen.apiKey,'moneyprinter-test-key');
  assert.equal(payload.seen.authorization,'');
  assert.equal(payload.seen.body.video_source,'pexels');
  assert.equal(payload.seen.body.video_count,3);
  assert.equal(payload.result.task_id,'task-123456');
  assert.equal(payload.result.metrics.cost_microunits,0);
});

test('Video Factory refuses unconfirmed backend in zero-cost mode', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AURA_VIDEO_FACTORY_ENABLED='true';
    process.env.AURA_VIDEO_FACTORY_BASE_URL='https://video.example.test';
    process.env.AURA_VIDEO_FACTORY_ZERO_COST_CONFIRMED='false';
    process.env.AURA_VIDEO_FACTORY_AUTO_PUBLISH_DISABLED_CONFIRMED='false';
    const { VideoFactoryClient }=await import('./src/video_factory.js');
    const factory=new VideoFactoryClient();
    console.log(JSON.stringify(factory.diagnostic()));
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{
    cwd:new URL('..',import.meta.url).pathname,
    encoding:'utf8',
    env:{...process.env}
  });
  assert.equal(result.status,0,result.stderr||result.stdout);
  const payload=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.enabled,false);
  assert.equal(payload.zero_cost_confirmed,false);
});

test('Video Factory plan blocks non-free media sources in zero-cost mode', () => {
  const factory=new VideoFactoryClient();
  assert.throws(
    () => factory.plan({subject:'x', video_source:'paid-provider'}),
    /non autorisée en mode zéro coût/
  );
});


test('Video Factory remains disabled when backend auto-publish is not confirmed off', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AURA_VIDEO_FACTORY_ENABLED='true';
    process.env.AURA_VIDEO_FACTORY_BASE_URL='https://video.example.test';
    process.env.AURA_VIDEO_FACTORY_ZERO_COST_CONFIRMED='true';
    process.env.AURA_VIDEO_FACTORY_AUTO_PUBLISH_DISABLED_CONFIRMED='false';
    const { VideoFactoryClient }=await import('./src/video_factory.js');
    const factory=new VideoFactoryClient();
    console.log(JSON.stringify(factory.diagnostic()));
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{
    cwd:new URL('..',import.meta.url).pathname,
    encoding:'utf8',
    env:{...process.env}
  });
  assert.equal(result.status,0,result.stderr||result.stdout);
  const payload=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.enabled,false);
  assert.equal(payload.zero_cost_confirmed,true);
  assert.equal(payload.auto_publish_disabled_confirmed,false);
});
