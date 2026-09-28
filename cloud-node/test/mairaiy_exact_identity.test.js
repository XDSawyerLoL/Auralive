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
  assert.match(dashboard, /Mairaiy · ff_siwis/);
  assert.match(dashboard, /aucun TTS générique utilisé/);
});

test('Voice Fabric accepts only the Quantic Studio ff_siwis identity', () => {
  const fabric = read('src/voice_fabric.js');
  const config = read('src/config.js');
  const env = read('.env.example');

  assert.match(fabric, /EXPECTED_ENGINE_VOICE = 'ff_siwis'/);
  assert.match(fabric, /EXPECTED_LANGUAGE = 'fr-fr'/);
  assert.match(fabric, /row\?\.engine_voice/);
  assert.match(fabric, /x-mairaiy-voice/);
  assert.match(fabric, /VoiceStudio identity mismatch/);
  assert.match(config, /voiceFabricLanguage: process\.env\.AURA_MAIRAIY_LANGUAGE \|\| 'fr-fr'/);
  assert.match(env, /AURA_MAIRAIY_LANGUAGE=fr-fr/);
});
