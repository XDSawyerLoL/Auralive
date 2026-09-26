import test from 'node:test';
import assert from 'node:assert/strict';
import { curiosityScore } from '../src/curiosity.js';
import { ProductRegistry } from '../src/product_registry.js';

test('curiosity prioritizes novel uncertain high-impact questions', () => {
  const high = curiosityScore({novelty:.9,uncertainty:.9,impact:.9,relevance:.9,repetition:0});
  const repeated = curiosityScore({novelty:.9,uncertainty:.9,impact:.9,relevance:.9,repetition:.9});
  const trivial = curiosityScore({novelty:.1,uncertainty:.1,impact:.1,relevance:.1,repetition:0});
  assert.ok(high > .8);
  assert.ok(high > repeated);
  assert.ok(repeated > trivial);
});

test('AURA Everywhere registry exposes a stable protocol version', () => {
  assert.equal(ProductRegistry.VERSION, 'aura-everywhere-v0.1');
});
