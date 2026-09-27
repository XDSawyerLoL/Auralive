import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const productsSource = fs.readFileSync(new URL('../src/products.js', import.meta.url), 'utf8');
const commandSource = fs.readFileSync(new URL('../src/command_center.js', import.meta.url), 'utf8');
const bridgeSource = fs.readFileSync(new URL('../src/bridge.js', import.meta.url), 'utf8');
const architecture = fs.readFileSync(new URL('../../ARCHITECTURE-QUANTIC-SILLAGE.md', import.meta.url), 'utf8');

test('canonical architecture makes AURA the parent platform', () => {
  assert.match(productsSource, /role: 'platform-core'/);
  assert.match(productsSource, /specialization: 'intelligence-and-control-plane'/);
  assert.match(architecture, /AURA.*intelligence mère/i);
  assert.match(architecture, /AURA Cloud/);
  assert.match(architecture, /AURA Runtime/);
  assert.match(architecture, /AURA Fabric \/ Mesh/);
});

test('Quantic Studio is defined only as the live-streaming product', () => {
  assert.match(productsSource, /specialization: 'live-streaming'/);
  assert.match(productsSource, /'streaming','broadcast','scenes','audio','overlays'/);
  assert.doesNotMatch(productsSource, /id: 'quantic-studio'[\s\S]{0,500}'local-ai'/);
  assert.match(architecture, /Quantic Studio.*streaming vivant/i);
});

test('local execution authority belongs to AURA Runtime, not Quantic Studio', () => {
  assert.match(commandSource, /id: 'aura-runtime'/);
  assert.match(commandSource, /name: 'AURA Runtime'/);
  assert.match(bridgeSource, /AURA Runtime local hors ligne/);
  assert.doesNotMatch(bridgeSource, /Quantic Studio local hors ligne/);
  assert.match(architecture, /AURA peut vivre sans Quantic Studio/);
});
