import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Mairaiy Cloud TTS produces browser-playable WAV without Quantic Studio', () => {
  const script = `
    process.env.TTS_API_KEY='unit-test-key';
    process.env.MAIRAIY_CLOUD_VOICE_ENABLED='true';
    process.env.TTS_MODEL='unit-test-model';
    process.env.TTS_VOICE='Leda';
    global.fetch=async function(){
      const pcm=Buffer.alloc(4800);
      return {
        ok:true,
        status:200,
        async json(){
          return {
            candidates:[{
              content:{parts:[{inlineData:{data:pcm.toString('base64'),mimeType:'audio/L16;codec=pcm;rate=24000'}}]}
            }]
          };
        }
      };
    };
    const { CloudVoice }=await import('./src/voice.js');
    const voice=new CloudVoice();
    const out=await voice.synthesize('Bonjour depuis AURA',{context:'aura-cloud-chat'});
    console.log(JSON.stringify({enabled:voice.enabled,engine:out.engine,voice:out.voice,mime:out.mime_type,header:Buffer.from(out.audio_base64,'base64').subarray(0,4).toString('ascii')}));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    env: { ...process.env },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const line = result.stdout.trim().split(/\r?\n/).at(-1);
  const payload = JSON.parse(line);
  assert.equal(payload.enabled, true);
  assert.equal(payload.engine, 'gemini-cloud-tts');
  assert.equal(payload.voice, 'Leda');
  assert.equal(payload.mime, 'audio/wav');
  assert.equal(payload.header, 'RIFF');
});
