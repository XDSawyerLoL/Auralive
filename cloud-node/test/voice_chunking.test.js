import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSpeechText } from '../src/voice.js';

test('Mairaiy speech segmentation preserves the complete response', () => {
  const text = [
    'Première phrase assez longue pour vérifier que le découpage conserve tout le contenu.',
    'Deuxième phrase avec encore du texte afin de dépasser largement la vieille limite de quatre cent trente caractères.',
    'Troisième phrase qui confirme que la réponse vocale peut continuer sans être coupée au milieu.',
    'Quatrième phrase pour produire une réponse réellement longue et vérifier que chaque segment reste de taille raisonnable.',
    'Cinquième phrase pour terminer le test de continuité vocale de Mairaiy sans perte de mots ni de ponctuation importante.'
  ].join(' ').repeat(3);

  assert.ok(text.length > 430);
  const chunks = splitSpeechText(text, 360);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 360));
  assert.equal(chunks.join(' ').replace(/\s+/g, ' ').trim(), text.replace(/\s+/g, ' ').trim());
});

test('single short response stays a single voice segment', () => {
  assert.deepEqual(splitSpeechText('Bonjour, je suis AURA.'), ['Bonjour, je suis AURA.']);
});
