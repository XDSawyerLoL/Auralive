import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNeuralFieldModel,
  normalizeAuraSelfReference,
} from '../src/neural-field.js';
import {
  initializeNeuralField,
  settleNeuralField,
} from '../src/neural-field-layout.js';

function sampleModel() {
  return buildNeuralFieldModel({
    soul: {
      current_intention: 'Évaluer ce qu’AURA peut continuer à faire côté Cloud.',
      dominant_thought: 'Comparer plusieurs hypothèses.',
      pressure: 0.22,
      curiosity: 0.82,
      introspection: 0.66,
      continuity: 0.78,
    },
    organism: {
      stabilite: 0.83,
      clarte: 0.77,
      curiosite: 0.84,
    },
    intentions: [
      { statement: 'Explorer une capacité nouvelle', priority: 0.8 },
    ],
    traces: [
      { title: 'Recherche', content: 'github web evidence analyse' },
    ],
    lessons: [
      { content: 'Vérifier avant de répéter.' },
    ],
    counts: {
      lessons: 8,
      outcomes: 13,
      reflections: 7,
      initiatives: 4,
      routines: 3,
      improvements: 2,
    },
    services: [
      {
        id: 'quantic-glide',
        name: 'Quantic Glide',
        kind: 'browser',
        criticality: 0.8,
        state: 'online',
        state_detail: 'Navigateur disponible',
      },
      {
        id: 'quantic-studio',
        name: 'Quantic Studio',
        kind: 'desktop',
        criticality: 0.7,
        state: 'standby',
        state_detail: 'Worker local absent',
      },
    ],
    fabricCaps: [
      { id: 'browser-use', name: 'Browser Use', observed_reliability: 0.86, provider: 'local' },
      { id: 'sandbox', name: 'Sandbox', observed_reliability: 0.78, provider: 'cloud' },
    ],
    bridgeStatus: { worker_online: false },
    webEnabled: true,
    horizonEnabled: true,
    previous: {},
  });
}

test('neural field model exposes a bounded functional graph', () => {
  const model = sampleModel();
  assert.equal(model.version, 'aura-cosmic-neural-v3.3');
  assert.ok(model.nodes.length >= 15);
  assert.ok(model.links.length >= 20);
  assert.ok(model.stats.clusters >= 6);

  const ids = new Set(model.nodes.map((node) => node.id));
  assert.ok(ids.has('aura'));
  assert.ok(ids.has('reasoning'));
  assert.ok(ids.has('memory'));
  assert.ok(ids.has('web'));
  assert.ok(ids.has('product:quantic-glide'));

  for (const node of model.nodes) {
    for (const key of ['score','activity','centrality','pulse']) {
      assert.ok(Number.isFinite(node[key]), `${node.id}.${key}`);
      assert.ok(node[key] >= 0 && node[key] <= 1, `${node.id}.${key}`);
    }
  }

  for (const edge of model.links) {
    assert.ok(ids.has(edge.source), edge.source);
    assert.ok(ids.has(edge.target), edge.target);
    assert.ok(edge.weight >= 0 && edge.weight <= 1);
    assert.ok(edge.activity >= 0 && edge.activity <= 1);
  }
});

test('AURA is the fixed center and products remain more peripheral', () => {
  const model = sampleModel();
  const field = settleNeuralField(initializeNeuralField(model), 160);
  const aura = field.byId.aura;
  assert.equal(aura.x, 0.5);
  assert.equal(aura.y, 0.5);
  assert.equal(aura.fixed, true);

  const radius = (node) => Math.hypot(node.x - 0.5, node.y - 0.5);
  const products = field.nodes.filter((node) => node.role === 'product');
  const coreCapabilities = field.nodes.filter(
    (node) => node.role === 'capability' && !['infrastructure'].includes(node.cluster),
  );

  const productRadius = products.reduce((sum, node) => sum + radius(node), 0) / products.length;
  const capabilityRadius = coreCapabilities.reduce((sum, node) => sum + radius(node), 0) / coreCapabilities.length;
  assert.ok(productRadius > capabilityRadius, `${productRadius} > ${capabilityRadius}`);

  for (const node of field.nodes) {
    assert.ok(Number.isFinite(node.x), node.id);
    assert.ok(Number.isFinite(node.y), node.id);
    assert.ok(node.x >= 0.05 && node.x <= 0.95, node.id);
    assert.ok(node.y >= 0.07 && node.y <= 0.93, node.id);
  }
});

test('legacy third-person internal narration is normalized', () => {
  const raw = 'Je viens de recevoir un signal direct : Évaluer ce qu’AURA peut faire pour AURA.';
  const normalized = normalizeAuraSelfReference(raw);
  assert.doesNotMatch(normalized, /signal direct/i);
  assert.doesNotMatch(normalized, /AURA peut/i);
  assert.doesNotMatch(normalized, /pour AURA/i);
  assert.match(normalized, /ce que je peux/i);
  assert.match(normalized, /pour moi/i);
});

test('dominant node is data-driven rather than hard-coded', () => {
  const model = sampleModel();
  const dominant = model.nodes.find((node) => node.dominant);
  assert.ok(dominant);
  assert.notEqual(dominant.id, 'aura');
  const ranked = model.nodes
    .filter((node) => node.id !== 'aura')
    .sort((a, b) => b.activity - a.activity || b.score - a.score);
  assert.equal(dominant.id, ranked[0].id);
});


test('V3.2 renderer keeps neuron-galaxy visual primitives', async () => {
  const { NEURAL_FIELD_SCRIPT } = await import('../src/neural-field-renderer.js');
  for (const token of [
    'state.filaments',
    'state.constellation',
    'drawClusterNebula(t)',
    'bezierCurveTo',
    'quadraticCurveTo',
    'globalCompositeOperation=\'lighter\'',
    'strongest=(state.field?.links||[])',
  ]) {
    assert.ok(NEURAL_FIELD_SCRIPT.includes(token), token);
  }
});


test('V3.3 renderer exposes dense living-network primitives', async () => {
  const { NEURAL_FIELD_SCRIPT } = await import('../src/neural-field-renderer.js');
  for (const token of [
    'drawGlialMesh(t)',
    'state.filaments',
    'state.constellation',
    'centralBoost',
    'drawSynapses(t)',
    "globalCompositeOperation='lighter'",
  ]) {
    assert.ok(NEURAL_FIELD_SCRIPT.includes(token), token);
  }
});


test('renderer declares node role before any conditional use', async () => {
  const { NEURAL_FIELD_SCRIPT } = await import('../src/neural-field-renderer.js');
  const declaration = NEURAL_FIELD_SCRIPT.indexOf("const role=String(node.role||'capability')");
  const firstUse = NEURAL_FIELD_SCRIPT.indexOf("if(intensity>.42&&role!=='product')");
  assert.ok(declaration >= 0, 'role declaration missing');
  assert.ok(firstUse >= 0, 'role use missing');
  assert.ok(declaration < firstUse, 'role must be initialized before conditional use');
});


test('V7 renderer builds local neural constellations around major capabilities', async () => {
  const { NEURAL_FIELD_SCRIPT } = await import('../src/neural-field-renderer.js');
  for (const token of [
    'function drawClusterConstellation',
    'drawClusterConstellation(node,p,t)',
    "node.id+':cluster:'",
    'const count=10+Math.round(activity*8+centrality*7)',
    "ctx.font='650 13px Inter,system-ui,sans-serif'",
  ]) {
    assert.ok(NEURAL_FIELD_SCRIPT.includes(token), token);
  }
});
