import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {BRAIN_EXPERIENCE_SCRIPT} from '../src/brain_experience_runtime.js';

test('brain chat contains parseable in-browser speech output with opt-out',()=>{
 assert.doesNotThrow(()=>new Script(BRAIN_EXPERIENCE_SCRIPT,
  {filename:'aura-brain-client.js'}));
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/brainVoiceToggle/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/aura_local_voice_opt_in/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/speechSynthesis\.speak\(utterance\)/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/localService===true/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/fr\(\?:-\|\$\)/);
});
test('browser speech is triggered only by nucleus-validated chat answers',()=>{
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/if\(data\?\.nucleus_verbalization_validated===true\)/);
 const start=BRAIN_EXPERIENCE_SCRIPT.indexOf('function speakVerifiedFrench(');
 const end=BRAIN_EXPERIENCE_SCRIPT.indexOf('function entry(',start);
 assert.ok(start>0&&end>start);
 const functionBody=BRAIN_EXPERIENCE_SCRIPT.slice(start,end);
 assert.match(functionBody,/if\(!brainVoiceEnabled\)return false/);
 assert.match(functionBody,/if\(!voice\)return false/);
 assert.doesNotMatch(functionBody,/fetch\(|XMLHttpRequest|AudioContext|https:\/\//i);
});
