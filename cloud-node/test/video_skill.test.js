import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { MoneyPrinterSkill, normalizeMoneyPrinterEndpoint } from '../src/video_skill.js';
import { CapabilityFabric } from '../src/capability_fabric.js';

test('MoneyPrinter endpoint policy requires HTTPS remotely', () => {
  assert.equal(normalizeMoneyPrinterEndpoint('https://video.example.test').trusted, true);
  assert.equal(normalizeMoneyPrinterEndpoint('http://127.0.0.1:8080').trusted, true);
  assert.equal(normalizeMoneyPrinterEndpoint('http://video.example.test').trusted, false);
  assert.equal(normalizeMoneyPrinterEndpoint('https://u:p@video.example.test').trusted, false);
});

test('AURA can plan a full short-video workflow without any paid backend', () => {
  const skill = new MoneyPrinterSkill();
  const plan = skill.plan({
    subject: 'Pourquoi les océans régulent le climat',
    aspect: '9:16',
    language: 'fr',
  });
  assert.equal(plan.skill, 'aura-video-autoproducer-v1');
  assert.equal(plan.payload.video_aspect, '9:16');
  assert.equal(plan.payload.video_language, 'fr');
  assert.equal(plan.payload.video_source, 'local');
  assert.ok(plan.stages.includes('voiceover'));
  assert.ok(plan.stages.includes('subtitles'));
  assert.ok(plan.stages.includes('edit-and-compose'));

  const fabric = new CapabilityFabric();
  const all = fabric.list({ includeDisabled: true });
  assert.equal(all.find((item) => item.id === 'video.pipeline.plan')?.enabled, true);
  assert.equal(all.find((item) => item.id === 'video.autoproduce')?.enabled, false);
});

test('zero-cost mode blocks an unconfirmed MoneyPrinter backend', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AURA_VIDEO_SKILL_ENABLED='true';
    process.env.AURA_MPT_BASE_URL='https://video.example.test';
    process.env.AURA_MPT_ZERO_COST_CONFIRMED='false';
    process.env.AURA_MPT_AUTO_PUBLISH_DISABLED_CONFIRMED='false';
    const { MoneyPrinterSkill } = await import('./src/video_skill.js');
    const skill = new MoneyPrinterSkill();
    console.log(JSON.stringify(skill.diagnostic()));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module','-e',script], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    env: { ...process.env },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.configured, true);
  assert.equal(payload.endpoint_trusted, true);
  assert.equal(payload.enabled, false);
  assert.equal(payload.zero_cost_confirmed, false);
});

test('confirmed zero-cost MoneyPrinter backend receives the compatible video contract', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AURA_VIDEO_SKILL_ENABLED='true';
    process.env.AURA_MPT_BASE_URL='https://video.example.test';
    process.env.AURA_MPT_API_KEY='test-secret';
    process.env.AURA_MPT_ZERO_COST_CONFIRMED='true';
    process.env.AURA_MPT_AUTO_PUBLISH_DISABLED_CONFIRMED='true';
    let seen=null;
    global.fetch=async(url, options={})=>{
      seen={
        url:String(url),
        apiKey:String(options.headers?.['X-API-Key']||''),
        body:JSON.parse(String(options.body||'{}')),
      };
      return new Response(JSON.stringify({
        status:200,
        message:'success',
        data:{task_id:'video-task-1'},
      }), {status:200,headers:{'content-type':'application/json'}});
    };
    const { MoneyPrinterSkill }=await import('./src/video_skill.js');
    const skill=new MoneyPrinterSkill();
    const out=await skill.submit({
      subject:'AURA et le futur du Web',
      aspect:'16:9',
      language:'fr',
    });
    console.log(JSON.stringify({seen,out}));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module','-e',script], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    env: { ...process.env },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.seen.url, 'https://video.example.test/api/v1/videos');
  assert.equal(payload.seen.apiKey, 'test-secret');
  assert.equal(payload.seen.body.video_subject, 'AURA et le futur du Web');
  assert.equal(payload.seen.body.video_aspect, '16:9');
  assert.equal(payload.out.task_id, 'video-task-1');
  assert.equal(payload.out.cost_microunits, 0);
});


test('render stays blocked when zero-cost is confirmed but MoneyPrinter auto-publish is not', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AURA_VIDEO_SKILL_ENABLED='true';
    process.env.AURA_MPT_BASE_URL='https://video.example.test';
    process.env.AURA_MPT_ZERO_COST_CONFIRMED='true';
    process.env.AURA_MPT_AUTO_PUBLISH_DISABLED_CONFIRMED='false';
    const { MoneyPrinterSkill } = await import('./src/video_skill.js');
    const skill = new MoneyPrinterSkill();
    console.log(JSON.stringify(skill.diagnostic()));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module','-e',script], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    env: { ...process.env },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.enabled, false);
  assert.equal(payload.zero_cost_confirmed, true);
  assert.equal(payload.auto_publish_disabled_confirmed, false);
});
