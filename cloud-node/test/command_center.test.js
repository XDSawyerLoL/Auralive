import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CommandCenter,
  repositoryHealth,
  summarizeWorkflowRuns,
  needsExternalEvidence,
  safeGithubChangePath,
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
  assert.deepEqual(bounded.requested_risks, ['safe', 'network', 'process']);
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

test('command center starts in proactive Director mode with a non-destructive operational envelope', () => {
  assert.match(configSource, /AURA_COMMAND_CENTER_ENABLED/);
  assert.match(configSource, /AURA_COMMAND_CENTER_AUTO_EXECUTE/);
  assert.match(configSource, /AURA_DIRECTOR_MODE_ENABLED/);
  assert.match(configSource, /safe,ai,network,process,local-control,local-write/);
  assert.doesNotMatch(configSource, /AURA_COMMAND_CENTER_ALLOWED_RISKS'[\s\S]{0,180}secret/);
});

test('AURA Runtime execution plane and private control API are wired', () => {
  assert.match(commandSource, /id: 'aura-runtime'/);
  assert.match(commandSource, /name: 'AURA Runtime'/);
  assert.doesNotMatch(commandSource, /objective: 'Fournir à AURA ses capacités locales/);
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
  assert.match(serverSource, /version:\s*'2\.2\.0'/);
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


test('AURA cross-product changes are branch-only, allowlisted and PR-gated', () => {
  assert.equal(safeGithubChangePath('src/main.js'), 'src/main.js');
  assert.equal(safeGithubChangePath('.env'), '');
  assert.equal(safeGithubChangePath('.github/workflows/release.yml'), '');
  assert.equal(safeGithubChangePath('scripts/sign-windows.ps1'), '');
  assert.equal(safeGithubChangePath('installer/setup.nsi'), '');
  assert.equal(safeGithubChangePath('package.json'), '');
  assert.equal(safeGithubChangePath('certs/signing.pfx'), '');
  assert.equal(safeGithubChangePath('../escape.js'), '');
  assert.match(configSource, /AURA_COMMAND_AUTO_CREATE_CHANGE_PR/);
  assert.match(configSource, /AURA_COMMAND_CHANGE_PR_MIN_CONFIDENCE/);
  assert.match(commandSource, /github\.propose_file_change/);
  assert.match(commandSource, /github-bounded-change-pr/);
  assert.match(commandSource, /auto_merge:\s*false/);
  assert.match(commandSource, /refs\/heads\/.*branch/);
  assert.doesNotMatch(commandSource, /github\.propose_file_change[\s\S]{0,6000}\/git\/refs\/heads\/main/);
  assert.match(serverSource, /\/api\/command\/change-proposals/);
});

test('repeated CI failures can trigger bounded Evolution Fleet repair', () => {
  assert.match(commandSource, /fleet-repair/);
  assert.match(commandSource, /fleet_mode: !isAura/);
  assert.match(commandSource, /executionMode = repository[\s\S]*'evolution-fleet'/);
});

test('offline Fleet evolution remains waiting instead of recording false success', () => {
  assert.match(commandSource, /crossProductEvolution && !bridgeOnline/);
  assert.match(commandSource, /execution_mode: 'waiting-local-worker'/);
  assert.match(commandSource, /returnedStatus\.startsWith\('waiting'\)/);
  assert.match(commandSource, /\['queued', 'leased'\]\.includes\(returnedStatus\)/);
  assert.match(commandSource, /const status = waiting \? 'waiting'/);
});

test('reconciliation records rejected or no-safe-patch Fleet worker results as failed', () => {
  assert.match(commandSource, /payloadStatus\.endsWith\('-rejected'\)/);
  assert.match(commandSource, /payloadStatus === 'no-safe-patch'/);
  assert.match(commandSource, /const finalStatus = evolutionRejected \? 'failed' : 'completed'/);
  assert.match(commandSource, /ok: !evolutionRejected/);
});

test('Director mode creates rotating portfolio Evolution initiatives', () => {
  assert.match(commandSource, /config\.directorModeEnabled/);
  assert.match(commandSource, /Direction · faire progresser/);
  assert.match(commandSource, /director_mode: true/);
  assert.match(commandSource, /Director Mode réalise une revue tournante du portefeuille/);
  assert.match(commandSource, /director-autonomous-operations/);
});

test('Director low-risk promotion merges only green safe AURA pull requests', async () => {
  const events = [];
  const center = new CommandCenter(
    {
      async trace(...args) { events.push(['trace', ...args]); },
      async observeEvent(...args) { events.push(['event', ...args]); },
    },
    {},
    {},
  );
  Object.defineProperty(center, 'githubToken', { value: 'test-token', configurable: true });
  const calls = [];
  center.github = async (path, options = {}) => {
    calls.push({ path, options });
    if (path === '/repos/XDSawyerLoL/Auralive/pulls?state=open&per_page=30') {
      return {
        data: [{
          number: 42,
          title: 'AURA safe improvement',
          html_url: 'https://github.com/XDSawyerLoL/Auralive/pull/42',
          draft: false,
          user: { login: 'XDSawyerLoL' },
          head: {
            ref: 'aura/change-safe-test',
            sha: 'abc123',
            user: { login: 'XDSawyerLoL' },
            repo: {
              full_name: 'XDSawyerLoL/Auralive',
              owner: { login: 'XDSawyerLoL' },
            },
          },
          base: { ref: 'main' },
        }],
      };
    }
    if (path === '/repos/XDSawyerLoL/Auralive/pulls/42/files?per_page=100') {
      return {
        data: [{
          filename: 'src/ui.js',
          status: 'modified',
          changes: 12,
          patch: '@@ -1 +1 @@\n-old\n+new',
        }],
      };
    }
    if (path === '/repos/XDSawyerLoL/Auralive/pulls/42/reviews?per_page=100') {
      return { data: [] };
    }
    if (path === '/repos/XDSawyerLoL/Auralive/commits/abc123/check-runs?per_page=100') {
      return { data: { check_runs: [{ status: 'completed', conclusion: 'success' }] } };
    }
    if (path === '/repos/XDSawyerLoL/Auralive/commits/abc123/status') {
      return { data: { statuses: [] } };
    }
    if (path === '/repos/XDSawyerLoL/Auralive/pulls/42/merge' && options.method === 'PUT') {
      return { data: { merged: true, sha: 'merged123' } };
    }
    if (path.includes('/pulls?state=open&per_page=30')) return { data: [] };
    throw new Error('unexpected mock path: ' + path);
  };

  const promoted = await center.promoteDirectorPullRequests();
  assert.equal(promoted.length, 1);
  assert.equal(promoted[0].pull_request_number, 42);
  assert.equal(promoted[0].policy, 'director-low-risk-green-checks-only');
  assert.ok(calls.some((item) => item.path.endsWith('/pulls/42/merge')));
  assert.ok(events.some((item) => item[0] === 'trace'));
});

test('Director auto-merge excludes sensitive semantic paths and dangerous patch primitives', () => {
  assert.match(commandSource, /sensitivePath/);
  assert.match(commandSource, /auth\|oauth\|security\|policy/);
  assert.match(commandSource, /sensitivePatch/);
  assert.match(commandSource, /child_process/);
  assert.match(commandSource, /DROP\\s\+TABLE/);
});

test('Director auto-merge rejects fork provenance even with an AURA-looking branch name', async () => {
  const center = new CommandCenter({ async trace() {}, async observeEvent() {} }, {}, {});
  Object.defineProperty(center, 'githubToken', { value: 'test-token', configurable: true });
  let merged = false;
  center.github = async (path, options = {}) => {
    if (path === '/repos/XDSawyerLoL/Auralive/pulls?state=open&per_page=30') {
      return {
        data: [{
          number: 77,
          title: 'Spoofed AURA branch',
          draft: false,
          user: { login: 'attacker' },
          head: {
            ref: 'aura/change-spoof',
            sha: 'bad123',
            user: { login: 'attacker' },
            repo: {
              full_name: 'attacker/Auralive',
              owner: { login: 'attacker' },
            },
          },
          base: { ref: 'main' },
        }],
      };
    }
    if (path.includes('/pulls/77/merge') && options.method === 'PUT') {
      merged = true;
      return { data: { merged: true } };
    }
    if (path.includes('/pulls?state=open&per_page=30')) return { data: [] };
    return { data: [] };
  };
  const result = await center.promoteDirectorPullRequests();
  assert.equal(result.length, 0);
  assert.equal(merged, false);
});

test('Director auto-merge requires same-repository trusted provenance', () => {
  assert.match(configSource, /AURA_DIRECTOR_TRUSTED_GITHUB_ACTORS/);
  assert.match(commandSource, /headRepository === repo\.toLowerCase\(\)/);
  assert.match(commandSource, /trustedActors\.has\(pullActor\)/);
  assert.match(commandSource, /trustedProvenance/);
});

test('Command Center does not use Quantic Studio as AURA execution authority', () => {
  assert.match(commandSource, /AURA Runtime worker offline/);
  assert.match(commandSource, /executionMode = 'aura-runtime-operator'/);
  assert.doesNotMatch(commandSource, /Quantic Studio worker offline/);
  assert.doesNotMatch(commandSource, /quantic-studio-operator/);
});

test('Command Center does not default AURA Runtime host back to Quantic Studio', () => {
  assert.match(commandSource, /compatibility_host: String\(bridgeStatus\?\.worker\?\.host_product \|\| ''\)/);
  assert.match(commandSource, /runtime_packaging:/);
  assert.match(commandSource, /runtime_role:/);
});


test('long-horizon missions persist across command-center cycles', () => {
  assert.match(commandSource, /LongHorizonMissionEngine/);
  assert.match(commandSource, /this\.longHorizon\.nextCandidate\(\)/);
  assert.match(commandSource, /this\.longHorizon\.bindInitiative/);
  assert.match(commandSource, /mode: 'long-horizon-mission'/);
  assert.match(commandSource, /long_horizon: longHorizon/);
});

test('private command API exposes mission oversight without replacing autonomy', () => {
  for (const route of [
    '/api/command/missions',
    '/api/command/missions/:id',
    '/api/command/missions/:id/:action',
  ]) {
    assert.equal(serverSource.includes(route), true, route);
  }
  assert.match(serverSource, /commandCenter\.createMission/);
  assert.match(serverSource, /commandCenter\.controlMission/);
});

test('long-horizon autonomy is enabled but bounded by existing command policy', () => {
  assert.match(configSource, /AURA_LONG_HORIZON_ENABLED/);
  assert.match(configSource, /AURA_LONG_HORIZON_AUTO_SEED/);
  assert.match(configSource, /AURA_LONG_HORIZON_MAX_REVISIONS/);
  assert.match(configSource, /AURA_LONG_HORIZON_STEP_MAX_ATTEMPTS/);
  assert.match(commandSource, /this\.candidate\(missionAdvance\.candidate\)/);
});


test('queued long-horizon initiatives are resumed after a crash', () => {
  assert.match(commandSource, /async resumeQueuedMissionInitiative\(\)/);
  assert.match(commandSource, /mode: 'long-horizon-resume'/);
  assert.match(commandSource, /SELECT i\.\*[\s\S]*aura_mission_steps/);
});

test('deduplicated mission initiatives are reloaded before execution', () => {
  assert.match(commandSource, /SELECT \* FROM aura_initiatives WHERE id=\?/);
  assert.match(commandSource, /initiative\.status === 'queued'/);
  assert.match(commandSource, /deduplicated: true/);
});


test('browser-control remains bounded by the shared policy for long missions', () => {
  assert.match(configSource, /safe,ai,network,process,local-control,local-write,browser-control/);
  assert.match(commandSource, /config\.commandCenterAllowedRisks/);
  assert.match(commandSource, /this\.candidate\(missionAdvance\.candidate\)/);
});


test('mission cancellation propagates to Runtime jobs', () => {
  assert.match(commandSource, /this\.bridge\.cancelJob/);
  assert.match(commandSource, /mission_steps ms[\s\S]*aura_initiatives i/);
  assert.match(commandSource, /i\.status IN \('queued','running','waiting'\)/);
});
