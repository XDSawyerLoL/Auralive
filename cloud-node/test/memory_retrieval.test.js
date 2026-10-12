import test from 'node:test';
import assert from 'node:assert/strict';
import { retrieveExperiences } from '../src/memory_retrieval.js';

const rows = [
  { kind: 'operational-outcome', note: 'Le navigateur a redémarré.' },
  { kind: 'operational-outcome', note: 'Le navigateur a redémarré.' },
  { kind: 'user-correction', note: 'Correction : AURA est responsable du langage français.' },
  { kind: 'operational-outcome', note: 'La sauvegarde des documents est terminée.' },
];
test('experience retrieval deduplicates identical notes', () => {
  assert.equal(retrieveExperiences(rows, { limit: 6 }).length, 3);
});
test('relevant older notes can outrank recent unrelated notes', () => {
  const found = retrieveExperiences(rows, { query: 'langage français', limit: 1 });
  assert.match(found[0].note, /langage français/);
});
test('retains evidence metadata and does not invent observations', () => {
  const input = [{ kind: 'user-correction', note: 'Nouveau fait', evidence_status: 'unverified' }];
  assert.equal(retrieveExperiences(input)[0].evidence_status, 'unverified');
  assert.deepEqual(retrieveExperiences([]), []);
});
