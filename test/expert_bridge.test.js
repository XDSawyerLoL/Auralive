import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  ExpertBridge,
  extractResponseText,
  sanitizeExpertContext,
} from '../src/expert_bridge.js';
import { CommandCenter } from '../src/command_center.js';

const expertSource = fs.readFileSync(new URL('../src/expert_bridge.js', import.meta.url), 'utf8');
const commandSource = fs.readFileSync(new URL('../src/command_center.js', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('Expert Bridge redacts secret-bearing fields and common bearer/token forms', () => {
  const sanitized = sanitizeExpertContext({
    error: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
    token: 'super-secret-token',
    nested: {
      api_key: 'sk-abcdefghijklmnopqrstuvwxyz012345',
      detail: 'GitHub github_pat_abcdefghijklmnopqrstuvwxyz123456',
    },
  });

  assert.equal(sanitized.token, '[REDACTED]');
  assert.equal(sanitized.nested.api_key, '[REDACTED]');
  assert.doesNotMatch(sanitized.error, /Bearer\s+abcdef/);
  assert.doesNotMatch(sanitized.nested.detail, /github_pat_abcdefghijklmnopqrstuvwxyz/);
});

test('Expert Bridge extracts structured Responses API text without relying on array position', () => {
  const text = extractResponseText({
    output: [
      { type: 'reasoning', summary: [] },
      {
        type: 'message',
        content: [
          { type: 'output_text', text: '{"diagnosis":"ok"}' },
        ],
      },
    ],
  });
  assert.equal(text, '{"diagnosis":"ok"}');
});

test('Expert Bridge uses Responses API structured output without granting tools to the advisor', () => {
  assert.match(expertSource, /\/responses/);
  assert.match(expertSource, /store:\s*false/);
  assert.match(expertSource, /type:\s*'json_schema'/);
  assert.match(expertSource, /human_required/);
  assert.match(expertSource, /L’expert ne possède aucun outil|ne contrôles aucun outil/);
  assert.doesNotMatch(expertSource, /type:\s*'function'/);
});

test('expert remediation becomes a native AURA initiative, not an external tool call', () => {
  const center = new CommandCenter({}, {}, {}, null, null, null, null, null);
  const candidate = center.expertRemediationCandidate(
    {
      id: 'failed-1',
      domain: 'quantic-mail',
      kind: 'evolution',
      title: 'Repair Quantic Mail',
      objective: 'Fix relay',
      rationale: 'failure',
      priority: 0.8,
      requested_risks: '[]',
      action_payload: '{"repository":"XDSawyerLoL/QuanticMail","base_branch":"main"}',
      action_type: '',
    },
    {
      ok: true,
      fingerprint: 'abc',
      diagnosis: 'Regression relay',
      probable_cause: 'bad parser',
      recommended_action: 'Inspect and patch the parser minimally.',
      action_kind: 'evolution',
      confidence: 0.9,
      risk_level: 'safe',
      human_required: false,
      human_reason: '',
      evidence_needed: ['tests pass'],
    },
  );
  assert.equal(candidate.kind, 'evolution');
  assert.equal(candidate.action_payload.repository, 'XDSawyerLoL/QuanticMail');
  assert.match(candidate.objective, /Inspect and patch/);
  assert.match(candidate.rationale, /AURA reste l’autorité d’exécution/);
  assert.equal(candidate.action_payload.expert_thread_id, 'failed-1');
});

test('high-risk external recommendations cannot directly become operator/evolution work', () => {
  const center = new CommandCenter({}, {}, {}, null, null, null, null, null);
  const candidate = center.expertRemediationCandidate(
    {
      id: 'failed-2',
      domain: 'aura',
      kind: 'operator',
      title: 'Dangerous repair',
      priority: 0.9,
      requested_risks: '["safe"]',
      action_payload: '{}',
    },
    {
      ok: true,
      fingerprint: 'def',
      diagnosis: 'unknown',
      probable_cause: 'unknown',
      recommended_action: 'Do something risky.',
      action_kind: 'operator',
      confidence: 0.95,
      risk_level: 'high',
      human_required: false,
      evidence_needed: [],
    },
  );
  assert.equal(candidate, null);
});

test('Command Center autonomously consults failed initiatives and exposes Expert Bridge status', () => {
  assert.match(commandSource, /async consultFailedInitiatives\(/);
  assert.match(commandSource, /expert-consultation/);
  assert.match(commandSource, /expert-remediation-proposed/);
  assert.match(commandSource, /expert-thread/);
  assert.match(commandSource, /expert_thread_id/);
  assert.match(commandSource, /expertBridgeMaxRoundsPerIncident/);
  assert.match(commandSource, /expertCandidates/);
  assert.match(commandSource, /expert_bridge:/);
});

test('Expert Bridge settings and private diagnostic endpoints exist', () => {
  for (const name of [
    'AURA_EXPERT_BRIDGE_ENABLED',
    'AURA_EXPERT_API_KEY',
    'AURA_EXPERT_MODEL',
    'AURA_EXPERT_MAX_CALLS_PER_HOUR',
    'AURA_EXPERT_MAX_ROUNDS_PER_INCIDENT',
    'AURA_EXPERT_COOLDOWN_SECONDS',
    'AURA_EXPERT_MIN_CONFIDENCE',
  ]) {
    assert.match(configSource, new RegExp(name));
  }
  assert.match(serverSource, /\/api\/command\/expert\/status/);
  assert.match(serverSource, /\/api\/command\/expert\/consult/);
});

test('Expert Bridge has an internal fallback so missing external credentials do not block AURA', () => {
  const fakeAi = {
    async generate() {
      return JSON.stringify({
        diagnosis: 'local',
        probable_cause: 'known',
        recommended_action: 'research',
        action_kind: 'research',
        confidence: 0.8,
        risk_level: 'safe',
        human_required: false,
        human_reason: '',
        evidence_needed: [],
      });
    },
  };
  const bridge = new ExpertBridge(fakeAi);
  const status = bridge.status({ publicView: false });
  assert.equal(typeof status.available, 'boolean');
  assert.equal(status.internal_fallback, true);
});
