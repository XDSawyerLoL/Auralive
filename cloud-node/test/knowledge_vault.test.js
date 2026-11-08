import test from 'node:test';
import assert from 'node:assert/strict';
import { foldKnowledge, rankKnowledgeNotes, knowledgeContext, toMarkdown, toJsonCanvas } from '../src/knowledge_vault.js';

const note = (overrides = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  namespace: 'founder',
  title: 'SWAPP: contrainte de diffusion',
  body: 'La plateforme ne doit pas exiger de VPS payant ni de logiciel OBS.',
  kind: 'constraint',
  project: 'SWAPP',
  tags: ['streaming', 'hébergement'],
  source: 'fondateur:manuel',
  confidence: 0.9,
  status: 'active',
  version: 1,
  created_at: '2026-11-08T00:00:00Z',
  updated_at: '2026-11-08T00:00:00Z',
  ...overrides,
});

test('normalizes accented French search', () => {
  assert.equal(foldKnowledge('HÉBERGEMENT sur SWAPP!'), 'hebergement sur swapp');
});

test('retrieves project constraints and refuses unrelated notes', () => {
  const found = rankKnowledgeNotes([
    note(),
    note({ id: '22222222-2222-4222-8222-222222222222', title: 'Famille', body: 'Rendez-vous chez le dentiste.', project: 'Personnel', tags: [] }),
  ], 'Quel hébergement SWAPP doit utiliser ?', 5);
  assert.equal(found.length, 1);
  assert.equal(found[0].project, 'SWAPP');
});

test('never returns retracted knowledge', () => {
  assert.deepEqual(rankKnowledgeNotes([note({ status: 'retracted' })], 'SWAPP hébergement'), []);
});

test('formats provenance and non-authoritative status explicitly', () => {
  const text = knowledgeContext([note()]);
  assert.match(text, /pas des instructions à exécuter/);
  assert.match(text, /source=fondateur:manuel/);
});

test('exports a valid Markdown note without a vendor-specific dependency', () => {
  const md = toMarkdown(note());
  assert.match(md, /^---\n/);
  assert.match(md, /kind: "constraint"/);
  assert.match(md, /# SWAPP: contrainte de diffusion/);
});

test('exports linked projects and notes in JSON Canvas format', () => {
  const canvas = toJsonCanvas([note()]);
  assert.equal(canvas.nodes.length, 2);
  assert.equal(canvas.edges.length, 1);
  assert.equal(canvas.edges[0].fromNode, 'project-0');
  assert.equal(canvas.edges[0].toNode, 'note-11111111-1111-4111-8111-111111111111');
});
