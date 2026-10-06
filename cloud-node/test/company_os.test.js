import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { CORE_QUANTIC_PRODUCTS } from '../src/products.js';
import { productHeartbeatHealth } from '../src/command_center.js';

test('Identity Vault is a first-class Quantic product', () => {
  const vault = CORE_QUANTIC_PRODUCTS.find((item) => item.id === 'identity-vault');
  assert.ok(vault);
  assert.equal(vault.role, 'product');
  assert.equal(vault.repository, 'XDSawyerLoL/QuanticMail');
  assert.ok(vault.capabilities.includes('vault'));
  assert.equal(vault.aura_bridge, 'required');
});

test('product heartbeat TTL transitions online to stale then offline', () => {
  const nowMs = Date.parse('2026-10-06T10:00:00.000Z');
  const fresh = productHeartbeatHealth({
    state: 'online',
    last_observed_at: '2026-10-06T09:55:00.000Z',
  }, { nowMs, staleSeconds: 600, offlineSeconds: 1200 });
  assert.equal(fresh.next_state, 'online');
  assert.equal(fresh.transition, false);

  const stale = productHeartbeatHealth({
    state: 'online',
    last_observed_at: '2026-10-06T09:48:00.000Z',
  }, { nowMs, staleSeconds: 600, offlineSeconds: 1200 });
  assert.equal(stale.next_state, 'stale');
  assert.equal(stale.transition, true);

  const offline = productHeartbeatHealth({
    state: 'stale',
    last_observed_at: '2026-10-06T09:30:00.000Z',
  }, { nowMs, staleSeconds: 600, offlineSeconds: 1200 });
  assert.equal(offline.next_state, 'offline');
  assert.equal(offline.transition, true);
});

test('company control plane contains bounded multi-product workstreams and receipts', () => {
  const source = fs.readFileSync(new URL('../src/command_center.js', import.meta.url), 'utf8');
  assert.match(source, /commandCenterPortfolioWorkstreams/);
  assert.match(source, /portfolio-workstreams/);
  assert.match(source, /async portfolioSnapshot\(\)/);
  assert.match(source, /async operationalLedger\(/);
  assert.match(source, /service-heartbeat-expired/);
});

test('scoped service identities replace implicit admin-token sharing', () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const bridge = fs.readFileSync(new URL('../src/bridge.js', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../../aura_runtime/worker.py', import.meta.url), 'utf8');

  assert.match(server, /function requireBridge\(/);
  assert.match(server, /function requireProduct\(/);
  assert.match(server, /AURA_CSRF_ORIGIN_REJECTED/);
  assert.match(server, /SameSite=Lax/);
  assert.match(bridge, /AURA_BRIDGE_TOKEN/);
  assert.match(worker, /AURA_BRIDGE_TOKEN/);
  assert.match(server, /scoped-product-token/);
});

test('autonomous merge is restricted to explicit low-risk surfaces and multiple checks', () => {
  const config = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
  const command = fs.readFileSync(new URL('../src/command_center.js', import.meta.url), 'utf8');

  assert.match(config, /AURA_DIRECTOR_MERGE_MIN_CHECKS/);
  assert.match(config, /AURA_DIRECTOR_AUTO_MERGE_PATH_PREFIXES/);
  assert.match(command, /allowedAutomergeSurface/);
  assert.match(command, /checks\.length < config\.directorMergeMinChecks/);
});

test('dashboard visibly exposes product portfolio and operational receipts', () => {
  const html = fs.readFileSync(new URL('../src/dashboard.js', import.meta.url), 'utf8');
  const runtime = fs.readFileSync(new URL('../src/dashboard-runtime.js', import.meta.url), 'utf8');

  assert.match(html, /Portefeuille Quantic Sillage/);
  assert.match(html, /Preuves opérationnelles/);
  assert.match(html, /id="portfolioList"/);
  assert.match(html, /id="receiptList"/);
  assert.match(runtime, /function renderPortfolio\(/);
  assert.match(runtime, /function renderReceipts\(/);
});
