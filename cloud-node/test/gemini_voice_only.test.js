import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ExpressionLayer } from '../src/expression.js';
import { CognitionEngine } from '../src/cognition.js';

test('Gemini provider is not used for semantic support or verbalization', async () => {
  let calls = 0;
  const ai = {
    enabled: true,
    provider: 'google-gemini',
    async generate() {
      calls += 1;
      return 'MODEL OUTPUT';
    },
  };
  const cognition = new CognitionEngine();
  const expression = new ExpressionLayer(ai, cognition);
  const plan = {
    act: 'respond',
    goal: 'Répondre.',
    facts: ['Message reçu : bonjour'],
    needs_semantic_support: true,
    semantic_query: 'bonjour',
    expressive_state: { mood: 'claire' },
  };

  const support = await expression.semanticSupport(plan, 'context');
  const answer = await expression.verbalize(plan);
  assert.equal(support, '');
  assert.notEqual(answer, 'MODEL OUTPUT');
  assert.equal(calls, 0);
});

test('kernel blocks Gemini from agent cognition and improvement diagnosis', () => {
  const kernel = readFileSync(new URL('../src/kernel.js', import.meta.url), 'utf8');
  assert.match(kernel, /externalCognitiveAiAllowed\(\)/);
  assert.match(kernel, /!String\(this\.ai\?\.provider \|\| ''\)\.includes\('google-gemini'\)/);
  assert.match(kernel, /if \(!this\.externalCognitiveAiAllowed\(\)\)/);
  assert.match(kernel, /if \(this\.externalCognitiveAiAllowed\(\)\) parsed = parseJsonObject/);
});

test('curiosity and evolution also reject Gemini as cognitive engine', () => {
  const curiosity = readFileSync(new URL('../src/curiosity.js', import.meta.url), 'utf8');
  const evolution = readFileSync(new URL('../src/evolution.js', import.meta.url), 'utf8');
  assert.match(curiosity, /!String\(this\.ai\?\.provider \|\| ''\)\.includes\('google-gemini'\)/);
  assert.match(evolution, /!String\(this\.ai\?\.provider \|\| ''\)\.includes\('google-gemini'\)/);
});
