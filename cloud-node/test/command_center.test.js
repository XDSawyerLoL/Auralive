import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CommandCenter,
  repositoryHealth,
  summarizeWorkflowRuns,
  needsExternalEvidence,
} from '../src/command_center.js';

const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const commandSource = fs.readFileSync(new URL('../src/command_center.js', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');

test('command center creates deterministic native initiative fingerprints', () => {
  const center = new CommandCenter({}, {}, {});
  const first = center.candidate({
    domain: 'quantic-news',
    kind: 'operator',
    objective: 'Vérifier un incident puis agir de façon réversible.',
    priority: 0.82,
    confidence: 0.88,
  });
  const second = center.candidate({
    domain: 'quantic-news',
    kind: 'operator',
    objective: 'Vérifier un incident puis agir de façon réversible.',
    priority: 0.10,
    confidence: 0.20,
  });
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.domain, 'quantic-news');
  assert.equal(first.kind, 'operator');
  assert.equal(first.priority, 0.82);
  assert.equal(first.confidence, 0.88);

  const bounded = center.candidate({
    domain: 'quantic-mail',
    kind: 'operator',
    objective: 'Tester la politique.',
    requested_risks: ['safe', 'network', 'process'],
  });
  assert.deepEqual(bounded.requested_risks, ['safe']);
});

test('autonomous initiatives are native decisions with outcome learning', () => {
  assert.match(commandSource, /async buildCandidates\(\)/);
  assert.match(commandSource, /async runCycle\(trigger = 'manual'\)/);
  assert.match(commandSource, /async reconcileWaiting\(\)/);
  assert.match(commandSource, /this\.kernel\.recordOutcome/);
  assert.match(commandSource, /this\.evolution\.dispatchCycle/);
  assert.match(commandSource, /this\.kernel\.operate/);
  assert.match(commandSource, /initiative hourly budget reached/);
  assert.match(commandSource, /confidence >= config\.commandCenterMinConfidence/);
});

test('command center starts automatically but inside an explicit risk envelope', () => {
  assert.match(configSource, /AURA_COMMAND_CENTER_ENABLED/);
  assert.match(configSource, /AURA_COMMAND_CENTER_AUTO_EXECUTE/);
  assert.match(configSource, /safe,ai,local-control,local-write/);
  assert.doesNotMatch(
    configSource,
    /AURA_COMMAND_CENTER_ALLOWED_RISKS'[\s\S]{0,160}safe,ai,network,local-write,process/,
  );
});

test('Quantic Sillage product registry and private control API are wired', () => {
  for (const product of [
    'Quantic Studio',
    'HORIZON',
    'Quantic News',
    'ZOON',
    'Quantic Mail',
    'Quantic Glide',
    'Providence',
    'Quantic OS',
  ]) {
    assert.equal(commandSource.includes(product), true, product);
  }
  for (const route of [
    '/api/command/status',
    '/api/command/initiatives',
    '/api/command/services',
    '/api/command/run',
    '/api/command/initiatives/:id/retry',
  ]) {
    assert.equal(serverSource.includes(route), true, route);
  }
  assert.match(serverSource, /type === 'quantic\.service\.state'/);
});

test('command center is part of runtime startup and shutdown', () => {
  assert.match(serverSource, /await commandCenter\.start\(\)/);
  assert.match(serverSource, /commandCenter\.stop\(\)/);
  assert.match(serverSource, /command_center_enabled/);
  assert.match(serverSource, /version:\s*'2\.0\.0'/);
});


test('fleet health detects failing workflows deterministically', () => {
  const runs = [
    { id: 2, name: 'CI', conclusion: 'failure', status: 'completed', created_at: '2026-09-25T12:00:00Z', run_attempt: 2 },
    { id: 1, name: 'CI', conclusion: 'failure', status: 'completed', created_at: '2026-09-25T11:00:00Z', run_attempt: 1 },
    { id: 3, name: 'Release', conclusion: 'success', status: 'completed', created_at: '2026-09-25T10:00:00Z' },
  ];
  const summary = summarizeWorkflowRuns(runs);
  const ci = summary.find((row) => row.name === 'CI');
  assert.equal(ci.failure_streak, 2);
  const health = repositoryHealth({ pushed_at: '2026-09-25T12:00:00Z', archived: false }, runs);
  assert.equal(health.state, 'degraded');
  assert.ok(health.score < 100);
  assert.equal(health.repeated_failures, 1);
});

test('command center can supervise and safely act on the Quantic GitHub fleet', () => {
  assert.match(commandSource, /async scanGithubFleet/);
  assert.match(commandSource, /github\.rerun_failed_jobs/);
  assert.match(commandSource, /github\.create_failure_issue/);
  assert.match(commandSource, /AutoOps/);
  assert.match(commandSource, /Aucun merge, déploiement, suppression ou changement de secret/);
  assert.match(configSource, /AURA_COMMAND_GITHUB_REPOS/);
  assert.match(configSource, /AURA_COMMAND_GITHUB_TOKEN/);
  assert.match(configSource, /AURA_COMMAND_AUTO_RERUN_FAILED_CI/);
});


test('externally-dependent intentions are routed through evidence gathering first', () => {
  assert.equal(needsExternalEvidence('Comparer le marché et les concurrents'), true);
  assert.equal(needsExternalEvidence('Vérifier la documentation API et la compatibilité'), true);
  assert.equal(needsExternalEvidence('Ranger la mémoire interne'), false);
  assert.match(commandSource, /kind: 'research'/);
  assert.match(commandSource, /this\.webSubstrate\.research/);
});


test('autonomous research initiatives use AURA Fabric DAGs when available', () => {
  assert.match(commandSource, /this\.dagCompiler\.compile/);
  assert.match(commandSource, /this\.graphExecutor\.execute/);
  assert.match(commandSource, /aura-fabric-research-dag/);
  assert.match(commandSource, /filter\(\(item\) => !item\.side_effects\)/);
  assert.match(serverSource, /new CommandCenter\([\s\S]*fabric,[\s\S]*dagCompiler,[\s\S]*graphExecutor/);
});


test('product liveness updates preserve canonical metadata', () => {
  assert.match(commandSource, /\.\.\.parseJson\(current\.metadata, \{\}\)/);
  assert.match(commandSource, /\.\.\.parseJson\(current\?\.metadata, \{\}\)/);
  assert.match(commandSource, /state=VALUES\(state\)/);
  assert.match(commandSource, /last_observed_at=VALUES\(last_observed_at\)/);
});
