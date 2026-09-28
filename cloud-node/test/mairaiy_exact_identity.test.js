import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('AURA web never falls back to a generic browser TTS for Mairaiy', () => {
  const dashboard = read('src/dashboard-runtime.js');

  assert.equal(dashboard.includes('speechSynthesis'), false);
  assert.equal(dashboard.includes('SpeechSynthesisUtterance'), false);
  assert.equal(dashboard.includes('speakBrowserFallback'), false);
  assert.match(dashboard, /Mairaiy · Aoede/);
  assert.match(dashboard, /aucun autre timbre utilisé/);
});

test('AURA canonical voice is historical Aoede and optional Voice Fabric must certify it', () => {
  const fabric = read('src/voice_fabric.js');
  const config = read('src/config.js');
  const env = read('.env.example');

  assert.match(fabric, /EXPECTED_ENGINE_VOICE = 'aoede'/);
  assert.match(fabric, /EXPECTED_LANGUAGE = 'fr-fr'/);
  assert.match(fabric, /row\?\.engine_voice/);
  assert.match(fabric, /x-mairaiy-voice/);
  assert.match(fabric, /VoiceStudio identity not certified/);
  assert.match(fabric, /engine_voice: EXPECTED_ENGINE_VOICE/);
  assert.match(config, /voiceFabricLanguage: 'fr-fr'/);
  assert.match(config, /voiceFabricStrictIdentity: true/);
  assert.match(config, /voiceModel: 'gemini-3\.1-flash-tts-preview'/);
  assert.match(config, /voiceName: 'Aoede'/);
  assert.match(config, /voiceFabricEnabled: bool\('AURA_VOICE_FABRIC_ENABLED', false\)/);
  assert.match(config, /voiceFabricBaseUrl: String\(process\.env\.AURA_VOICE_FABRIC_BASE_URL \|\| ''\)/);
  assert.doesNotMatch(config, /voiceFabricBaseUrl: 'https:\/\/mediumorchid-badger-314305\.hostingersite\.com\/voice'/);
  assert.match(env, /MAIRAIY_CLOUD_VOICE_ENABLED=true/);
  assert.match(env, /TTS_MODEL=gemini-3\.1-flash-tts-preview/);
  assert.match(env, /TTS_VOICE=Aoede/);
  assert.match(env, /AURA_VOICE_FABRIC_ENABLED=false/);
  assert.match(env, /AURA_MAIRAIY_LANGUAGE=fr-fr/);
});
