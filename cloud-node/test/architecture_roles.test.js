import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const products = fs.readFileSync(new URL('../src/products.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../src/bridge.js', import.meta.url), 'utf8');

test('AURA is the parent system and Quantic Studio is streaming-only', () => {
  assert.match(products, /architecture_role: 'parent-control-plane'/);
  assert.match(products, /id: 'aura-runtime'/);
  assert.match(products, /architecture_role: 'local-execution-plane'/);
  assert.match(products, /Logiciel de streaming vivant/);
  assert.match(server, /parent_system: 'AURA is the parent control plane/);
  assert.match(server, /quantic_studio_role: 'living streaming product only/);
});

test('local execution bridge is named AURA Runtime', () => {
  assert.match(bridge, /Pont AURA Cloud ↔ AURA Runtime/);
  assert.match(bridge, /AURA Runtime local hors ligne/);
  assert.doesNotMatch(bridge, /Quantic Studio local hors ligne/);
});
