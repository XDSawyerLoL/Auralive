import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { CognitionEngine } from '../src/cognition.js';
import { CapabilityFabric } from '../src/capability_fabric.js';
import { config } from '../src/config.js';
import { AURA_RELEASE } from '../src/release.js';

test('modern interface lineage is preserved', () => {
  const dashboard = fs.readFileSync(new URL('../src/dashboard.js', import.meta.url), 'utf8');
  assert.match(dashboard, /Carte d’intérêt|Carte d'interet|galax|neural|neur/i);
  assert.ok(dashboard.length > 50000, 'modern dashboard unexpectedly replaced by a reduced legacy UI');
  assert.equal(AURA_RELEASE.interface_generation, 'cognitive-galaxies-live-signals');
});

test('priority question and short follow-up stay inside native operational continuity', () => {
  const engine = new CognitionEngine();
  const intentions = [
    { statement: 'Corréler intentions, actions et carte neuronale', priority: 0.98 },
    { statement: 'Étendre les capacités Cloud autonomes', priority: 0.94 },
    { statement: 'Stabiliser la voix Mairaiy', priority: 0.88 },
  ];
  const first = engine.planReply({
    text: 'Quelles sont tes trois priorités actuelles ?',
    soul: { organism: {} },
    intentions,
    lessons: [],
    reflections: [],
    work: [],
    continuity: { messages: [{ role: 'user', content: 'Quelles sont tes trois priorités actuelles ?' }] },
    privateView: true,
  });
  assert.equal(first.act, 'report_priorities');
  assert.equal(first.needs_semantic_support, false);
  assert.match(engine.deterministicReply(first), /1\).*Corréler/i);

  const follow = engine.planReply({
    text: 'alors ?',
    soul: { organism: {} },
    intentions,
    lessons: [],
    reflections: [],
    work: [],
    continuity: {
      messages: [
        { role: 'user', content: 'Quelles sont tes trois priorités actuelles ?' },
        { role: 'assistant', content: engine.deterministicReply(first) },
        { role: 'user', content: 'alors ?' },
      ],
    },
    privateView: true,
  });
  assert.equal(follow.act, 'report_priorities');
  assert.equal(follow.needs_semantic_support, false);
});

test('Cloud workspace exists and local AI is no longer preferred by default', () => {
  const fabric = new CapabilityFabric();
  const cloud = fabric.list().filter((item) => item.provider === 'aura-cloud-workspace');
  assert.ok(cloud.length >= 3);
  assert.equal(config.localAiPreferred, false);
});

test('modern Hostinger server advertises Cloud-first execution without replacing modern dialogue layer', () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const entry = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /execution_policy:\s*'cloud-first-local-optional'/);
  assert.match(server, /local_worker_required:\s*false/);
  assert.match(server, /AURA Cloud typed workspace first/);
  assert.match(entry, /framework:\s*'fastify-direct'/);
  assert.doesNotMatch(entry, /await import\('\.\/src\/server\.js'\)/);
});
