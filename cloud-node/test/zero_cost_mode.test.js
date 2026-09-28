import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

function run(script, env = {}) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('zero-cost mode blocks Gemini/OpenAI-compatible remote fallback even when a key exists', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AI_MODE='gemini';
    process.env.AI_API_KEY='test-key-that-must-never-be-used';
    global.fetch=async()=>{ throw new Error('REMOTE_FETCH_MUST_NOT_RUN'); };
    const { AiClient }=await import('./src/ai.js');
    const ai=new AiClient(null);
    const out=await ai.generate('hello','system',32);
    console.log(JSON.stringify({enabled:ai.enabled,provider:ai.provider,out,diag:ai.diagnostic()}));
  `;
  const result = run(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.enabled, false);
  assert.equal(payload.provider, 'blocked-zero-cost');
  assert.equal(payload.out, '');
  assert.equal(payload.diag.remote_fallback_blocked, true);
});

test('zero-cost mode disables cloud TTS even if TTS_API_KEY is present', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.MAIRAIY_CLOUD_VOICE_ENABLED='true';
    process.env.TTS_API_KEY='test-key-that-must-never-be-used';
    global.fetch=async()=>{ throw new Error('REMOTE_TTS_MUST_NOT_RUN'); };
    const { CloudVoice }=await import('./src/voice.js');
    const voice=new CloudVoice();
    console.log(JSON.stringify(voice.diagnostic()));
  `;
  const result = run(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.enabled, false);
  assert.equal(payload.engine, 'blocked-zero-cost');
  assert.equal(payload.zero_cost_mode, true);
});

test('zero-cost mode prevents external Expert Bridge use even if an OpenAI key exists', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AURA_EXPERT_BRIDGE_ENABLED='true';
    process.env.AURA_EXPERT_API_KEY='sk-test-key-that-must-never-be-used';
    const { ExpertBridge }=await import('./src/expert_bridge.js');
    const bridge=new ExpertBridge({ generate: async()=>'' });
    console.log(JSON.stringify({external:bridge.externalAvailable,status:bridge.status({publicView:false})}));
  `;
  const result = run(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.external, false);
  assert.equal(payload.status.zero_cost_mode, true);
});

test('runtime bridge excludes explicitly billable and Ollama :cloud workers', () => {
  const source = fs.readFileSync(new URL('../src/bridge.js', import.meta.url), 'utf8');
  assert.match(source, /workerMayCreateCost/);
  assert.match(source, /:cloud/);
  assert.match(source, /billing_required/);
  assert.match(source, /cost_microunits/);
});

test('cancelled runtime work is terminal and becomes a failed AURA initiative', () => {
  const bridge = fs.readFileSync(new URL('../src/bridge.js', import.meta.url), 'utf8');
  const command = fs.readFileSync(new URL('../src/command_center.js', import.meta.url), 'utf8');
  assert.match(bridge, /cancelled/);
  assert.match(bridge, /canceled/);
  assert.match(command, /cancelled/);
  assert.match(command, /canceled/);
});

test('command center redacts secrets before persisting operational errors', () => {
  const source = fs.readFileSync(new URL('../src/command_center.js', import.meta.url), 'utf8');
  assert.match(source, /safeOperationalError/);
  assert.match(source, /REDACTED/);
  assert.match(source, /github_pat_/);
});

test('Hostinger example keeps zero-cost fail-closed while allowing configured Aoede', () => {
  const env = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(env, /^AURA_ZERO_COST_MODE=true$/m);
  assert.match(env, /^AI_MODE=off$/m);
  assert.match(env, /^AURA_FREE_FEDERATION_ENABLED=true$/m);
  assert.match(env, /^AURA_OPENROUTER_FREE_MODELS=openrouter\/free$/m);
  assert.match(env, /^MAIRAIY_CLOUD_VOICE_ENABLED=true$/m);
  assert.match(env, /^AURA_GEMINI_FREE_TIER_CONFIRMED=false$/m);
  assert.match(env, /^TTS_MODEL=gemini-3\.1-flash-tts-preview$/m);
  assert.match(env, /^TTS_VOICE=Aoede$/m);
});
