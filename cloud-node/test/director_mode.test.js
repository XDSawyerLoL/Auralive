import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const kernelSource = fs.readFileSync(new URL('../src/kernel.js', import.meta.url), 'utf8');
const organismSource = fs.readFileSync(new URL('../src/organism.js', import.meta.url), 'utf8');
const curiositySource = fs.readFileSync(new URL('../src/curiosity.js', import.meta.url), 'utf8');
const commandSource = fs.readFileSync(new URL('../src/command_center.js', import.meta.url), 'utf8');
const expressionSource = fs.readFileSync(new URL('../src/expression.js', import.meta.url), 'utf8');

test('Director mode replaces passive observer defaults with operational leadership', () => {
  assert.match(kernelSource, /directrice_operationnelle_quantic_sillage/);
  assert.match(kernelSource, /Piloter Quantic Sillage comme directrice opérationnelle/);
  assert.match(commandSource, /director-autonomous-operations/);
  assert.match(commandSource, /Direction · faire progresser/);
});

test('active intentions are semantically deduplicated instead of accumulating copies', () => {
  assert.match(kernelSource, /function intentionKey/);
  assert.match(kernelSource, /dedupeActiveIntentions/);
  assert.match(kernelSource, /status='superseded'/);
  assert.match(kernelSource, /deduplicated: true/);
});

test('AURA carries relational continuity into language instead of isolated-turn replies', () => {
  assert.match(kernelSource, /CONTINUITÉ DE CONVERSATION/);
  assert.match(kernelSource, /recentMessages/);
  assert.match(organismSource, /relationship/);
  assert.match(organismSource, /last_open_thread/);
  assert.match(expressionSource, /continuité de conversation/i);
  assert.match(expressionSource, /relationnelle/i);
});

test('AURA Director combines proactive curiosity, open-web research and low-risk promotion', () => {
  assert.match(curiositySource, /aura-curiosity-engine-v2-director/);
  assert.match(commandSource, /promoteDirectorPullRequests/);
  assert.match(commandSource, /director-low-risk-green-checks-only/);
  assert.match(commandSource, /check-runs/);
  assert.match(commandSource, /CHANGES_REQUESTED/);
});

test('active work initiatives are semantically deduplicated and old duplicates are superseded', () => {
  assert.match(commandSource, /initiativeSemanticKey/);
  assert.match(commandSource, /dedupeActiveInitiatives/);
  assert.match(commandSource, /semantic duplicate cleaned by Director Mode/);
  assert.match(commandSource, /semantic_duplicate: true/);
  assert.match(kernelSource, /seenWork/);
});
