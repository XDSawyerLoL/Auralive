import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const kernel = readFileSync(new URL('../src/kernel.js', import.meta.url), 'utf8');
const commandCenter = readFileSync(new URL('../src/command_center.js', import.meta.url), 'utf8');
const curiosity = readFileSync(new URL('../src/curiosity.js', import.meta.url), 'utf8');
const neural = readFileSync(new URL('../src/neural-field.js', import.meta.url), 'utf8');
const expression = readFileSync(new URL('../src/expression.js', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../src/ai.js', import.meta.url), 'utf8');

test('conversation, command center, curiosity and neural field share cognitiveState', () => {
  assert.ok(kernel.includes('async cognitiveState({ publicView = false } = {})'));
  assert.ok(kernel.includes('cognitiveState,\n      privateView'));
  assert.ok(commandCenter.includes("this.kernel.cognitiveState({ publicView: false })"));
  assert.ok(curiosity.includes("this.kernel.cognitiveState({ publicView: false })"));
  assert.ok(neural.includes('cognitiveState = {}'));
  assert.ok(neural.includes('cognitiveState?.dominant_focus?.title'));
});

test('Gemini text is blocked while native expression owns final wording', () => {
  assert.ok(ai.includes("if (config.aiMode === 'gemini') return false"));
  assert.ok(ai.includes("gemini-text-blocked"));
  assert.ok(expression.includes('return naturalize(this.cognition.deterministicReply(plan))'));
  assert.ok(expression.includes("provider.includes('gemini')"));
});
