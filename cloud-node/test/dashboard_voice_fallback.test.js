import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DASHBOARD_SCRIPT } from '../src/dashboard-runtime.js';

const dashboard=fs.readFileSync(new URL('../src/dashboard.js',import.meta.url),'utf8');
function functionBody(name) {
  const m=DASHBOARD_SCRIPT.match(new RegExp('function '+name+'\\([^)]*\\)\\{[\\s\\S]*?\\n\\}','m'));
  assert.ok(m,'Client-side speech helper missing: '+name);
  return m[0];
}

test('browser dashboard script remains syntactically valid',()=>{
  assert.doesNotThrow(()=>new vm.Script(DASHBOARD_SCRIPT));
});

test('explicit opt-in button distinguishes local voice from Mairaiy Aoede',()=>{
  assert.match(dashboard,/id="localVoiceBtn"/);
  assert.match(dashboard,/aria-pressed="false"/);
  assert.match(dashboard,/Voix locale : OFF/);
  assert.match(DASHBOARD_SCRIPT,/aura_local_voice_opt_in/);
  assert.match(DASHBOARD_SCRIPT,/différente d’Aoede/);
});

test('selected local mode does not send the utterance to a remote TTS API',()=>{
  const start=DASHBOARD_SCRIPT.indexOf('async function speakAura(text,ticket){');
  const option=DASHBOARD_SCRIPT.indexOf('if(localVoiceOptIn){',start);
  const local=DASHBOARD_SCRIPT.indexOf('await speakLocalFrench(text);',option);
  const skip=DASHBOARD_SCRIPT.indexOf('return;',local);
  const remote=DASHBOARD_SCRIPT.indexOf("api('/api/voice/speak'",start);
  assert.ok(start>=0 && start<option && option<local && local<skip && skip<remote);
  assert.match(DASHBOARD_SCRIPT,/localVoiceOptIn = false/);
});

test('only local French voices are eligible',()=>{
  const getter=functionBody('localFrenchVoice');
  const voices=[
    {name:'Remote FR',lang:'fr-FR',localService:false},
    {name:'Local EN',lang:'en-US',localService:true},
    {name:'Local FR',lang:'fr-FR',localService:true},
  ];
  const window={speechSynthesis:{getVoices:()=>voices},SpeechSynthesisUtterance:function(){}};
  const pick=new Function('window',getter+'; return localFrenchVoice();');
  assert.equal(pick(window).name,'Local FR');
  assert.equal(pick({...window,speechSynthesis:{getVoices:()=>voices.slice(0,2)}}),null);
});

test('spoken text removes markdown, code and raw URLs before pronunciation',()=>{
  const clean=new Function(functionBody('spokenFrenchText')+';return spokenFrenchText;')();
  const value=clean('**Bonjour**. [Guide](https://example.org) \\x60\\x60\\x60js\\nconst secret = 1;\\n\\x60\\x60\\x60 Consulte https://example.org');
  assert.match(value,/Bonjour/);
  assert.match(value,/Guide/);
  assert.doesNotMatch(value,/https:|const secret|\\*\\*/);
});

test('long responses are split into short speech utterances',()=>{
  const clean=functionBody('spokenFrenchText');
  const chunks=functionBody('spokenFrenchChunks');
  const splitter=new Function(clean+';'+chunks+';return spokenFrenchChunks;')();
  const segments=splitter('Une phrase française assez longue. '.repeat(60),170);
  assert.ok(segments.length>2);
  assert.ok(segments.every(s=>s.length<=170));
});

test('voice fallback requires no paid package or new dependencies',()=>{
  const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(),['dotenv','fastify','mysql2']);
  assert.equal(DASHBOARD_SCRIPT.includes('elevenlabs.io'),false);
  assert.equal(DASHBOARD_SCRIPT.includes('api.openai.com/v1/audio'),false);
});
