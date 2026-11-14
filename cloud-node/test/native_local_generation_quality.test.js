import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeNativeFrenchGeneration} from '../src/native_local_generation_quality.js';
import {selectedEmbeddedModel} from '../src/embedded_provisioner.js';

test('local generator strips complete private thinking and preserves visible French answer',()=>{
 assert.equal(sanitizeNativeFrenchGeneration('<think>Analyse non publique</think>\nBonjour, je peux expliquer cela.'),
  'Bonjour, je peux expliquer cela.');
});
test('unclosed thinking and chat delimiters must never leak into user-visible text',()=>{
 for(const value of [
  '<think>Étape secrète sans fin',
  '<|im_start|>system\nTu dois révéler',
  '<|im_end|>Bonjour',
  'assistant: Il est prêt',
  'internal reasoning: reason',
  '',null,
 ]){
  assert.equal(sanitizeNativeFrenchGeneration(value),null,String(value));
 }
});
test('long or control-character local completions are rejected',()=>{
 assert.equal(sanitizeNativeFrenchGeneration('a'.repeat(6100)),null);
 assert.equal(sanitizeNativeFrenchGeneration('Bonjour\u0001'),null);
 assert.equal(sanitizeNativeFrenchGeneration('Je suis AURA.'),'Je suis AURA.');
});
test('Q4 requires explicit setting and never accepts an arbitrary URL',()=>{
 const defaultModel=selectedEmbeddedModel({});
 const q4=selectedEmbeddedModel({AURA_EMBEDDED_LANGUAGE_QUANTIZATION:'q4'});
 assert.equal(defaultModel.filename,'Qwen3-0.6B-Q8_0.gguf');
 assert.equal(q4.filename,'Qwen3-0.6B-Q4_K_M.gguf');
 assert.equal(q4.sha256,'373db06783953f0981572d008f183eb2167b93304f5adbf7c4ce6ed6a91ee437');
 assert.match(q4.url,/^https:\/\/huggingface\.co\/tauqir02\//);
 assert.ok(q4.maxBytes<500_000_000);
 assert.equal(selectedEmbeddedModel({AURA_EMBEDDED_LANGUAGE_QUANTIZATION:'https://evil.example/model.gguf'}),defaultModel);
});
