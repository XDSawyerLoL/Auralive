import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  aggregateEvidence,
  sourcePrior,
  WebSubstrate,
} from '../src/web_substrate.js';

const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const webSource = fs.readFileSync(new URL('../src/web_substrate.js', import.meta.url), 'utf8');
const kernelSource = fs.readFileSync(new URL('../src/kernel.js', import.meta.url), 'utf8');
const expressionSource = fs.readFileSync(new URL('../src/expression.js', import.meta.url), 'utf8');

test('source priors distinguish institutional and generic sources', () => {
  assert.ok(sourcePrior('https://www.who.int/example') > sourcePrior('https://example.com/post'));
  assert.ok(sourcePrior('https://arxiv.org/abs/1234') > sourcePrior('https://example.com/post'));
  assert.ok(sourcePrior('https://fr.wikipedia.org/wiki/Test') >= 0.6);
});

test('evidence gate requires independent corroboration and exposes contradictions', () => {
  const corroborated = aggregateEvidence([
    { stance: 'support', relevance: 1, reliability: 0.9, independent_key: 'a.example' },
    { stance: 'support', relevance: 0.95, reliability: 0.88, independent_key: 'b.example' },
    { stance: 'support', relevance: 0.8, reliability: 0.82, independent_key: 'c.example' },
  ]);
  assert.equal(corroborated.epistemic_status, 'corroborated');
  assert.equal(corroborated.independent_supporting_sources, 3);
  assert.ok(corroborated.confidence >= 0.72);

  const contested = aggregateEvidence([
    { stance: 'support', relevance: 0.9, reliability: 0.8, independent_key: 'a.example' },
    { stance: 'contradict', relevance: 0.9, reliability: 0.9, independent_key: 'b.example' },
  ]);
  assert.equal(contested.epistemic_status, 'contested');
  assert.equal(contested.independent_contradicting_sources, 1);
});

test('Web substrate separates hypothesis generation from evidence verdict', () => {
  assert.match(webSource, /Le modèle ne doit PAS conclure/);
  assert.match(webSource, /aggregateEvidence\(evidence\)/);
  assert.match(webSource, /independent-source-corroboration/);
  assert.match(webSource, /epistemic_status/);
  assert.match(webSource, /contradict/);
});

test('Web substrate blocks private-network retrieval and arbitrary remote shell', () => {
  const substrate = new WebSubstrate({ enabled: false });
  assert.match(webSource, /Hôte réseau privé interdit/);
  assert.match(webSource, /Résolution DNS vers un réseau privé interdite/);
  assert.match(webSource, /redirect: 'error'/);
  assert.equal(substrate.status().arbitrary_remote_shell, false);
});

test('Web substrate is wired as external memory into AURA', () => {
  assert.match(configSource, /AURA_WEB_SUBSTRATE_ENABLED/);
  assert.match(serverSource, /new WebSubstrate\(ai\)/);
  assert.match(serverSource, /\/api\/reasoning\/research/);
  assert.match(serverSource, /\/api\/reasoning\/sessions/);
  assert.match(serverSource, /\/api\/reasoning\/status/);
  assert.match(kernelSource, /MÉMOIRE EXTERNE/);
  assert.match(kernelSource, /webSubstrate\.externalContext/);
});


test('live chat routes changing external questions through Web evidence first', () => {
  assert.match(kernelSource, /requiresExternalKnowledge/);
  assert.match(kernelSource, /this\.webSubstrate\.research/);
  assert.match(kernelSource, /external_evidence_required/);
  assert.match(kernelSource, /external_epistemic_status/);
  assert.match(expressionSource, /MÉMOIRE EXTERNE/);
  assert.match(expressionSource, /contested, unverified ou unavailable/);
});
