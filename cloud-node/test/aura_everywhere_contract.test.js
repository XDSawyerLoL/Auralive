import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../src/server.js', import.meta.url),'utf8');
const db = fs.readFileSync(new URL('../src/db.js', import.meta.url),'utf8');
const config = fs.readFileSync(new URL('../src/config.js', import.meta.url),'utf8');
const registry = fs.readFileSync(new URL('../src/product_registry.js', import.meta.url),'utf8');
const curiosity = fs.readFileSync(new URL('../src/curiosity.js', import.meta.url),'utf8');

test('AURA Everywhere API is private and wired into runtime', () => {
  for (const route of [
    '/api/aura/everywhere/status',
    '/api/aura/everywhere/register',
    '/api/aura/everywhere/:id/heartbeat',
    '/api/aura/everywhere/capabilities',
  ]) assert.equal(server.includes(route), true, route);
  assert.equal(server.includes('requirePrivate(request, reply)'), true);
  assert.equal(server.includes('await productRegistry.seed()'), true);
});

test('all current Quantic products are seeded', () => {
  for (const id of ['aura','quantic-studio','quantic-glide','quantic-mail','quantic-os','zoon','pulse','quantic-news','providence']) {
    assert.equal(registry.includes("'"+id+"'"), true, id);
  }
});

test('Curiosity is persistent, bounded and web-capable', () => {
  assert.equal(db.includes('aura_curiosity_questions'), true);
  assert.equal(db.includes('aura_products'), true);
  assert.equal(config.includes('AURA_CURIOSITY_TICK_SECONDS'), true);
  assert.equal(config.includes('AURA_CURIOSITY_RESEARCH_PER_CYCLE'), true);
  assert.equal(config.includes('AURA_CURIOSITY_MIN_SCORE'), true);
  assert.equal(curiosity.includes("this.web.research(question,{trigger:'curiosity'})"), true);
  assert.equal(curiosity.includes("status='queued' AND score>=?"), true);
  assert.equal(server.includes('await curiosity.start()'), true);
  assert.equal(server.includes('curiosity.stop()'), true);
});
