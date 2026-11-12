import test from 'node:test';
import assert from 'node:assert/strict';
import {SEMANTIC_PERCEPTION_BROWSER} from '../src/semantic_perception_browser.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';
test('semantic browser runtime parses after interpolation into existing interface',()=>{
 assert.ok(SEMANTIC_PERCEPTION_BROWSER.includes('processLocally=true'));
 assert.ok(SEMANTIC_PERCEPTION_BROWSER.includes("device:'wasm'"));
 assert.ok(BRAIN_OPERATIONS_SCRIPT.includes('Comprendre la parole'));
 assert.doesNotThrow(()=>new Function(BRAIN_OPERATIONS_SCRIPT));
});
test('no remote recognition fallback or raw media POST is built into semantic controls',()=>{
 assert.ok(SEMANTIC_PERCEPTION_BROWSER.includes("Speech.available(options)"));
 assert.ok(SEMANTIC_PERCEPTION_BROWSER.includes("recognizer.processLocally=true"));
 assert.doesNotMatch(SEMANTIC_PERCEPTION_BROWSER,/webkitSpeechRecognition|MediaRecorder|canvas\.toDataURL\(|send\(canvas/);
 assert.ok(SEMANTIC_PERCEPTION_BROWSER.includes("'visual-classification'"));
});
