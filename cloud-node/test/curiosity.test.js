import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeQuestion,
  requiresFreshWeb,
  explicitUserIntent,
} from '../src/curiosity.js';
import { CORE_QUANTIC_PRODUCTS, seedQuanticProducts } from '../src/products.js';

const curiositySource = fs.readFileSync(new URL('../src/curiosity.js', import.meta.url), 'utf8');

test('curiosity normalizes questions and detects fresh-web needs', () => {
  assert.equal(normalizeQuestion('  Pourquoi AURA ne voit pas Glide  '), 'Pourquoi AURA ne voit pas Glide?');
  assert.equal(normalizeQuestion('Déjà une question ?'), 'Déjà une question ?');
  assert.equal(requiresFreshWeb('Quelles technologies récentes peuvent améliorer le Mesh ?'), true);
  assert.equal(requiresFreshWeb('Quel est mon état intérieur ?'), false);
});

test('interlocutor curiosity only reacts to explicit intent cues', () => {
  assert.equal(explicitUserIntent("Je veux qu'AURA soit plus curieuse"), true);
  assert.equal(explicitUserIntent('Bonjour AURA'), false);
});

test('canonical Quantic registry covers the whole ecosystem surface', () => {
  const ids = new Set(CORE_QUANTIC_PRODUCTS.map((item) => item.id));
  for (const id of [
    'aura',
    'quantic-studio',
    'quantic-glide',
    'quantic-os',
    'quantic-mail',
    'zoon',
    'pulse',
    'quantic-news',
    'providence',
    'horizon',
  ]) {
    assert.equal(ids.has(id), true, id);
  }
  for (const product of CORE_QUANTIC_PRODUCTS) {
    assert.ok(product.repository, product.id);
    assert.ok(Array.isArray(product.capabilities) && product.capabilities.length > 0, product.id);
  }
});

test('registry seeding uses command-center products and modification policy', async () => {
  const calls = [];
  const rows = [];
  const fake = {
    async services() { return rows; },
    async upsertService(payload) {
      calls.push(payload);
      const row = {
        ...payload,
        metadata: payload.metadata || {},
      };
      rows.push(row);
      return row;
    },
  };

  const seeded = await seedQuanticProducts(fake);
  assert.equal(seeded.length, CORE_QUANTIC_PRODUCTS.length);
  const auraCall = calls.find((item) => item.id === 'aura');
  const studioCall = calls.find((item) => item.id === 'quantic-studio');
  assert.equal(auraCall.kind, 'platform-core');
  assert.equal(auraCall.metadata.role, 'platform-core');
  assert.equal(auraCall.metadata.parent, null);
  assert.equal(studioCall.kind, 'quantic-product');
  assert.equal(studioCall.metadata.role, 'product');
  assert.equal(studioCall.metadata.parent, 'aura');
  assert.equal(studioCall.metadata.specialization, 'live-streaming');
  assert.equal(
    calls.filter((item) => item.id !== 'aura').every((item) => item.kind === 'quantic-product'),
    true,
  );
  assert.equal(calls.every((item) => item.metadata.writable_by_aura === true), true);
  assert.equal(
    calls.every((item) => item.metadata.modification_policy === 'branch-test-canary-promote'),
    true,
  );
});

test('Director curiosity rotates portfolio angles and uses shorter dedupe windows', () => {
  assert.match(curiositySource, /aura-curiosity-engine-v2-director/);
  assert.match(curiositySource, /portfolioAngles/);
  assert.match(curiositySource, /dedupeHours = 24/);
  assert.match(curiositySource, /Veille exécutive autonome/);
  assert.match(curiositySource, /dedupeHours: 2/);
});

test('canonical hierarchy makes AURA the parent platform and Studio only the streaming product', () => {
  const aura = CORE_QUANTIC_PRODUCTS.find((item) => item.id === 'aura');
  const studio = CORE_QUANTIC_PRODUCTS.find((item) => item.id === 'quantic-studio');
  assert.equal(aura.role, 'platform-core');
  assert.equal(aura.parent, null);
  assert.equal(studio.role, 'product');
  assert.equal(studio.parent, 'aura');
  assert.equal(studio.specialization, 'live-streaming');
  assert.equal(studio.capabilities.includes('streaming'), true);
  assert.equal(studio.capabilities.includes('local-ai'), false);
});
