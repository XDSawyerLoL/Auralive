import { createHash, randomUUID } from 'node:crypto';
import { config } from './config.js';
import { one, query } from './db.js';
import { clamp } from './policy.js';

const now = () => new Date().toISOString();

const DEFAULT_SERVICES = [
  {
    id: 'aura',
    name: 'AURA',
    kind: 'core',
    objective: 'Maintenir le noyau AURA disponible, cohérent, apprenant et capable d’agir.',
    criticality: 1,
  },
  {
    id: 'quantic-studio',
    name: 'Quantic Studio',
    kind: 'execution',
    objective: 'Fournir à AURA ses capacités locales, ses modèles, ses outils et son bras opérateur.',
    criticality: 0.95,
  },
  {
    id: 'horizon',
    name: 'HORIZON',
    kind: 'intelligence',
    objective: 'Apporter des signaux vérifiés et du contexte prédictif sans transformer les hypothèses en faits.',
    criticality: 0.86,
  },
  {
    id: 'quantic-news',
    name: 'Quantic News',
    kind: 'information',
    objective: 'Transformer les informations utiles en contexte exploitable pour l’écosystème.',
    criticality: 0.72,
  },
  {
    id: 'zoon',
    name: 'ZOON',
    kind: 'social',
    objective: 'Maintenir la couche sociale de Quantic Sillage exploitable, observable et cohérente.',
    criticality: 0.68,
  },
  {
    id: 'quantic-mail',
    name: 'Quantic Mail',
    kind: 'communication',
    objective: 'Maintenir une messagerie souveraine et exploitable par l’écosystème.',
    criticality: 0.76,
  },
  {
    id: 'quantic-glide',
    name: 'Quantic Glide',
    kind: 'browser',
    objective: 'Fournir un accès Web privé, portable et compatible à l’écosystème.',
    criticality: 0.72,
  },
  {
    id: 'providence',
    name: 'Providence',
    kind: 'knowledge',
    objective: 'Transformer les documents et informations en connaissances utilisables.',
    criticality: 0.66,
  },
  {
    id: 'quantic-os',
    name: 'Quantic OS',
    kind: 'platform',
    objective: 'Servir de couche système cohérente aux produits Quantic Sillage.',
    criticality: 0.74,
  },
];

const ACTIVE_STATUSES = new Set(['queued', 'running', 'waiting']);
const BAD_SERVICE_STATES = new Set(['degraded', 'offline', 'error', 'unhealthy']);
const BAD_WORKFLOW_CONCLUSIONS = new Set([
  'failure',
  'timed_out',
  'action_required',
  'startup_failure',
]);
const REPO_SERVICE_MAP = new Map([
  ['xdsawyerlol/auralive', 'aura'],
  ['xdsawyerlol/quanticsillage', 'quantic-sillage'],
  ['xdsawyerlol/quanticmail', 'quantic-mail'],
  ['xdsawyerlol/quantic-os', 'quantic-os'],
  ['xdsawyerlol/quantic-browser', 'quantic-glide'],
  ['xdsawyerlol/human-agency-engine', 'providence'],
]);

export function summarizeWorkflowRuns(rows = []) {
  const ordered = [...rows].sort((a, b) =>
    String(b?.created_at || '').localeCompare(String(a?.created_at || '')));
  const groups = new Map();
  for (const row of ordered) {
    const name = String(row?.name || row?.workflow_id || 'workflow');
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  return [...groups.entries()].map(([name, history]) => {
    const latest = history[0] || {};
    let failureStreak = 0;
    for (const run of history) {
      if (BAD_WORKFLOW_CONCLUSIONS.has(String(run?.conclusion || '').toLowerCase())) failureStreak += 1;
      else break;
    }
    return {
      name,
      id: Number(latest.id || 0),
      conclusion: String(latest.conclusion || ''),
      status: String(latest.status || ''),
      html_url: String(latest.html_url || ''),
      head_sha: String(latest.head_sha || ''),
      head_branch: String(latest.head_branch || ''),
      run_attempt: Number(latest.run_attempt || 1),
      created_at: String(latest.created_at || ''),
      updated_at: String(latest.updated_at || ''),
      failure_streak: failureStreak,
    };
  });
}

export function repositoryHealth(meta = {}, workflowRuns = []) {
  const workflows = summarizeWorkflowRuns(workflowRuns);
  const failed = workflows.filter((item) =>
    BAD_WORKFLOW_CONCLUSIONS.has(String(item.conclusion || '').toLowerCase()));
  const repeated = failed.filter((item) => item.failure_streak >= 2);
  const pushedAt = Date.parse(String(meta.pushed_at || ''));
  const staleDays = Number.isFinite(pushedAt)
    ? Math.max(0, (Date.now() - pushedAt) / 86_400_000)
    : 0;
  let score = 100;
  score -= Math.min(60, failed.length * 22);
  score -= Math.min(20, repeated.length * 8);
  if (staleDays > 120) score -= 8;
  if (meta.archived) score -= 30;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    state: failed.length ? 'degraded' : (meta.archived ? 'offline' : 'healthy'),
    workflows,
    failing_workflows: failed,
    repeated_failures: repeated.length,
    stale_days: Math.round(staleDays),
  };
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function fingerprint(parts) {
  return createHash('sha256')
    .update(parts.map((item) => String(item || '').trim().toLowerCase()).join('|'))
    .digest('hex')
    .slice(0, 40);
}

function normalizeRisks(value) {
  const source = value instanceof Set ? [...value] : Array.from(value || []);
  return [...new Set(source.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
}

export class CommandCenter {
  static VERSION = 'aura-command-center-v1';

  constructor(kernel, evolution, bridge) {
    this.kernel = kernel;
    this.evolution = evolution;
    this.bridge = bridge;
    this.started = false;
    this.running = false;
    this.timer = null;
    this.warmupTimer = null;
    this.lastCycleAt = '';
    this.lastActionAt = '';
    this.lastFleetPollAt = '';
    this.lastFleetPollMs = 0;
    this.fleetSnapshot = [];
    this.lastError = '';
  }

  async init() {
    const stamp = now();
    for (const service of DEFAULT_SERVICES) {
      await query(
        `INSERT INTO aura_command_services(
          id,name,kind,objective,endpoint,repository,criticality,enabled,state,state_detail,
          last_observed_at,metadata,created_at,updated_at
        ) VALUES(?,?,?,?, '', '', ?,1,'unknown','', '', '{}',?,?)
        ON DUPLICATE KEY UPDATE
          name=VALUES(name),
          kind=VALUES(kind),
          objective=IF(objective='' OR objective IS NULL, VALUES(objective), objective),
          criticality=GREATEST(criticality, VALUES(criticality)),
          updated_at=VALUES(updated_at)`,
        [
          service.id,
          service.name,
          service.kind,
          service.objective,
          clamp(service.criticality),
          stamp,
          stamp,
        ],
      );
    }
  }

  async start() {
    if (this.started) return;
    await this.init();
    this.started = true;
    if (!config.commandCenterEnabled) return;
    const run = () => this.runCycle('autonomous').catch((error) => {
      this.lastError = String(error?.message || error).slice(0, 1000);
    });
    this.warmupTimer = setTimeout(
      run,
      Math.min(120_000, Math.max(15_000, config.commandCenterWarmupSeconds * 1000)),
    );
    this.timer = setInterval(run, config.commandCenterTickSeconds * 1000);
    this.warmupTimer.unref?.();
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.warmupTimer) clearTimeout(this.warmupTimer);
    this.timer = null;
    this.warmupTimer = null;
    this.started = false;
  }

  get githubToken() {
    return String(config.commandCenterGithubToken || '').trim();
  }

  async github(path, { method = 'GET', body = null } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.commandCenterRequestTimeoutMs);
    try {
      const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'AURA-Command-Center',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      if (this.githubToken) headers.Authorization = `Bearer ${this.githubToken}`;
      if (body != null) headers['Content-Type'] = 'application/json';
      const response = await fetch(`https://api.github.com${path}`, {
        method,
        headers,
        body: body == null ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      if (!response.ok) {
        const error = new Error(
          `GitHub ${method} ${path}: ${data?.message || response.status}`,
        );
        error.status = response.status;
        error.data = data;
        throw error;
      }
      return { status: response.status, data };
    } finally {
      clearTimeout(timeout);
    }
  }

  async scanRepository(repository) {
    const repo = String(repository || '').trim();
    if (!repo.includes('/')) return { repository: repo, state: 'error', error: 'nom de dépôt invalide' };
    try {
      const metaResponse = await this.github(`/repos/${repo}`);
      const meta = metaResponse.data || {};
      const branch = String(meta.default_branch || 'main');
      const runsResponse = await this.github(
        `/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=12`,
      ).catch((error) => {
        if (error?.status === 404) return { data: { workflow_runs: [] } };
        throw error;
      });
      const runs = Array.isArray(runsResponse?.data?.workflow_runs)
        ? runsResponse.data.workflow_runs
        : [];
      const health = repositoryHealth(meta, runs);
      return {
        repository: repo,
        name: String(meta.name || repo.split('/').pop() || repo),
        private: Boolean(meta.private),
        default_branch: branch,
        pushed_at: String(meta.pushed_at || ''),
        html_url: String(meta.html_url || ''),
        archived: Boolean(meta.archived),
        state: health.state,
        health_score: health.score,
        stale_days: health.stale_days,
        workflows: health.workflows,
        failing_workflows: health.failing_workflows,
        repeated_failures: health.repeated_failures,
        observed_at: now(),
      };
    } catch (error) {
      const status = Number(error?.status || 0);
      return {
        repository: repo,
        name: repo.split('/').pop() || repo,
        private: status === 404,
        state: status === 404 ? 'unknown' : 'error',
        health_score: status === 404 ? 50 : 0,
        workflows: [],
        failing_workflows: [],
        repeated_failures: 0,
        observed_at: now(),
        error: status === 404 && !this.githubToken
          ? 'Dépôt privé ou non visible sans identité machine GitHub.'
          : String(error?.message || error).slice(0, 500),
      };
    }
  }

  async syncRepositoryService(snapshot) {
    const repoKey = String(snapshot.repository || '').toLowerCase();
    const mapped = REPO_SERVICE_MAP.get(repoKey);
    const serviceId = mapped || `repo-${repoKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70)}`;
    const existing = await one('SELECT id,name,kind,objective,criticality FROM aura_command_services WHERE id=?', [serviceId]);
    if (!existing) {
      await this.upsertService({
        id: serviceId,
        name: snapshot.name || snapshot.repository,
        kind: 'repository',
        objective: `Maintenir ${snapshot.repository} sain, testable et livrable.`,
        repository: snapshot.repository,
        criticality: snapshot.repository === 'XDSawyerLoL/Auralive' ? 1 : 0.72,
        state: snapshot.state,
        state_detail: snapshot.error || '',
        last_observed_at: snapshot.observed_at,
        metadata: { github: snapshot },
      });
      return;
    }
    await query(
      `UPDATE aura_command_services
       SET repository=?,state=?,state_detail=?,last_observed_at=?,metadata=?,updated_at=?
       WHERE id=?`,
      [
        snapshot.repository,
        snapshot.state,
        String(snapshot.error || (
          snapshot.failing_workflows?.length
            ? `${snapshot.failing_workflows.length} workflow(s) en échec sur ${snapshot.default_branch}`
            : `Santé GitHub ${snapshot.health_score}%`
        )).slice(0, 4000),
        snapshot.observed_at,
        JSON.stringify({ github: snapshot }).slice(0, 20000),
        now(),
        serviceId,
      ],
    );
  }

  async scanGithubFleet({ force = false } = {}) {
    const due = force
      || !this.lastFleetPollMs
      || Date.now() - this.lastFleetPollMs >= config.commandCenterFleetPollSeconds * 1000;
    if (!due) return this.fleetSnapshot;

    const snapshot = [];
    for (const repo of config.commandCenterGithubRepos) {
      const item = await this.scanRepository(repo);
      snapshot.push(item);
      await this.syncRepositoryService(item).catch(() => {});
    }
    this.fleetSnapshot = snapshot;
    this.lastFleetPollMs = Date.now();
    this.lastFleetPollAt = now();
    await query(
      'INSERT INTO aura_command_events(initiative_id,kind,payload,created_at) VALUES(NULL,?,?,?)',
      [
        'fleet-scan',
        JSON.stringify({
          repositories: snapshot.map((item) => ({
            repository: item.repository,
            state: item.state,
            health_score: item.health_score,
            failing_workflows: item.failing_workflows?.map((run) => ({
              name: run.name,
              id: run.id,
              conclusion: run.conclusion,
              failure_streak: run.failure_streak,
            })) || [],
          })),
        }).slice(0, 30000),
        now(),
      ],
    );
    return snapshot;
  }

  githubCandidates(snapshot = []) {
    const candidates = [];
    for (const repo of snapshot) {
      if (!Array.isArray(repo.failing_workflows) || !repo.failing_workflows.length) continue;
      const criticality = repo.repository === 'XDSawyerLoL/Auralive' ? 1 : 0.78;
      for (const run of repo.failing_workflows.slice(0, 2)) {
        if (run.id) {
          candidates.push(this.candidate({
            domain: REPO_SERVICE_MAP.get(String(repo.repository).toLowerCase()) || 'quantic-sillage',
            kind: 'github',
            action_type: 'github.rerun_failed_jobs',
            action_payload: {
              repository: repo.repository,
              run_id: run.id,
              workflow: run.name,
              head_sha: run.head_sha,
              run_attempt: run.run_attempt,
            },
            title: `Relancer le CI défaillant de ${repo.name}`,
            objective:
              `Relancer uniquement les jobs en échec du workflow ${run.name} sur ${repo.repository}, puis observer le résultat avant toute autre action.`,
            rationale:
              `Workflow ${run.name}=${run.conclusion}; série d’échecs=${run.failure_streak}.`,
            priority: Math.min(0.98, 0.72 + criticality * 0.18 + Math.min(run.failure_streak, 3) * 0.025),
            confidence: 0.96,
            requested_risks: ['safe'],
            signature: `github-rerun:${repo.repository}:${run.id}:${run.run_attempt}`,
          }));
        }

        if (run.failure_streak >= 2 || run.run_attempt >= 2) {
          candidates.push(this.candidate({
            domain: REPO_SERVICE_MAP.get(String(repo.repository).toLowerCase()) || 'quantic-sillage',
            kind: 'github',
            action_type: 'github.create_failure_issue',
            action_payload: {
              repository: repo.repository,
              workflow: run.name,
              head_sha: run.head_sha,
              run_id: run.id,
              failure_streak: run.failure_streak,
              html_url: run.html_url,
            },
            title: `Documenter l’échec persistant de ${repo.name}`,
            objective:
              `Créer un ticket de diagnostic traçable pour le workflow ${run.name} de ${repo.repository}. Ne modifier aucun code et ne déclencher aucun déploiement.`,
            rationale:
              `Échec persistant détecté automatiquement; série=${run.failure_streak}, tentative=${run.run_attempt}.`,
            priority: Math.min(0.96, 0.77 + criticality * 0.12 + Math.min(run.failure_streak, 4) * 0.02),
            confidence: 0.97,
            requested_risks: ['safe'],
            signature: `github-issue:${repo.repository}:${run.name}:${run.head_sha}`,
          }));
        }

        if (
          String(repo.repository).toLowerCase() === 'xdsawyerlol/auralive'
          && run.failure_streak >= 2
        ) {
          candidates.push(this.candidate({
            domain: 'aura',
            kind: 'evolution',
            title: 'Auto-réparer AURA après échecs CI répétés',
            objective:
              `AURA détecte ${run.failure_streak} échecs consécutifs du workflow ${run.name} sur son propre dépôt. Diagnostiquer la cause, produire le correctif minimal, valider par sandbox + CI + canary avant toute promotion.`,
            rationale: 'Le centre de commande déclenche Evolution sur une preuve opérationnelle répétée.',
            priority: 0.99,
            confidence: 0.94,
            requested_risks: [],
            signature: `self-repair:${run.name}:${run.head_sha}`,
          }));
        }
      }
    }
    return candidates;
  }

  async executeGithubInitiative(initiative) {
    if (!this.githubToken) {
      return {
        status: 'waiting',
        execution_mode: 'github-readonly',
        result: {
          reason: 'AURA_COMMAND_GITHUB_TOKEN absent: observation autonome active, écriture GitHub verrouillée.',
        },
      };
    }
    const action = String(initiative.action_type || '');
    const payload = initiative.action_payload || {};
    const repository = String(payload.repository || '');
    if (!repository.includes('/')) throw new Error('dépôt GitHub manquant');

    if (action === 'github.rerun_failed_jobs') {
      if (!config.commandCenterAutoRerunFailedCi) {
        return {
          status: 'waiting',
          execution_mode: 'github-action-disabled',
          result: { reason: 'AURA_COMMAND_AUTO_RERUN_FAILED_CI=false' },
        };
      }
      const runId = Number(payload.run_id || 0);
      if (!runId) throw new Error('run_id GitHub manquant');
      const response = await this.github(
        `/repos/${repository}/actions/runs/${runId}/rerun-failed-jobs`,
        { method: 'POST' },
      );
      return {
        status: 'completed',
        execution_mode: 'github-safe-rerun',
        result: {
          executed: true,
          repository,
          run_id: runId,
          status_code: response.status,
        },
      };
    }

    if (action === 'github.create_failure_issue') {
      if (!config.commandCenterAutoCreateFailureIssue) {
        return {
          status: 'waiting',
          execution_mode: 'github-action-disabled',
          result: { reason: 'AURA_COMMAND_AUTO_CREATE_FAILURE_ISSUE=false' },
        };
      }
      const marker = `<!-- aura-command:${initiative.fingerprint} -->`;
      const title = `[AURA AutoOps] ${payload.workflow || 'Workflow'} en échec persistant`.slice(0, 240);
      const body = [
        marker,
        'AURA a détecté automatiquement un échec CI persistant.',
        '',
        `- Dépôt: ${repository}`,
        `- Workflow: ${payload.workflow || 'inconnu'}`,
        `- Commit: ${payload.head_sha || 'inconnu'}`,
        `- Série d’échecs: ${Number(payload.failure_streak || 0)}`,
        payload.html_url ? `- Exécution: ${payload.html_url}` : '',
        '',
        'Action automatique volontairement limitée: diagnostic et traçabilité uniquement. '
          + 'Aucun merge, déploiement, suppression ou changement de secret n’a été effectué.',
      ].filter(Boolean).join('\n');
      const response = await this.github(
        `/repos/${repository}/issues`,
        { method: 'POST', body: { title, body } },
      );
      return {
        status: 'completed',
        execution_mode: 'github-safe-issue',
        result: {
          executed: true,
          repository,
          issue_number: Number(response.data?.number || 0),
          issue_url: String(response.data?.html_url || ''),
        },
      };
    }

    throw new Error(`action GitHub autonome non autorisée: ${action}`);
  }

  async services() {
    const rows = await query(
      `SELECT id,name,kind,objective,endpoint,repository,criticality,enabled,state,state_detail,
              last_observed_at,metadata,created_at,updated_at
       FROM aura_command_services
       ORDER BY criticality DESC,name ASC`,
    );
    return rows.map((row) => ({
      ...row,
      criticality: Number(row.criticality || 0),
      enabled: Boolean(row.enabled),
      metadata: parseJson(row.metadata, {}),
    }));
  }

  async upsertService(payload = {}) {
    const id = String(payload.id || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 80);
    const name = String(payload.name || '').trim().slice(0, 160);
    if (!id || !name) throw new Error('id et name sont requis');
    const stamp = now();
    await query(
      `INSERT INTO aura_command_services(
        id,name,kind,objective,endpoint,repository,criticality,enabled,state,state_detail,
        last_observed_at,metadata,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?, ?,?,?)
      ON DUPLICATE KEY UPDATE
        name=VALUES(name),
        kind=VALUES(kind),
        objective=VALUES(objective),
        endpoint=VALUES(endpoint),
        repository=VALUES(repository),
        criticality=VALUES(criticality),
        enabled=VALUES(enabled),
        metadata=VALUES(metadata),
        updated_at=VALUES(updated_at)`,
      [
        id,
        name,
        String(payload.kind || 'service').slice(0, 80),
        String(payload.objective || '').slice(0, 4000),
        String(payload.endpoint || '').slice(0, 1000),
        String(payload.repository || '').slice(0, 300),
        clamp(payload.criticality ?? 0.5),
        payload.enabled === false ? 0 : 1,
        String(payload.state || 'unknown').slice(0, 40),
        String(payload.state_detail || '').slice(0, 4000),
        String(payload.last_observed_at || ''),
        JSON.stringify(payload.metadata || {}).slice(0, 20000),
        stamp,
        stamp,
      ],
    );
    return one('SELECT * FROM aura_command_services WHERE id=?', [id]);
  }

  async observeService(id, payload = {}) {
    const serviceId = String(id || '').trim().slice(0, 80);
    const state = String(payload.state || 'unknown').trim().toLowerCase().slice(0, 40);
    const detail = String(payload.detail || payload.state_detail || '').slice(0, 4000);
    const metadata = JSON.stringify(payload.metadata || {}).slice(0, 20000);
    const stamp = now();
    const result = await query(
      `UPDATE aura_command_services
       SET state=?,state_detail=?,last_observed_at=?,metadata=?,updated_at=?
       WHERE id=?`,
      [state, detail, stamp, metadata, stamp, serviceId],
    );
    if (!Number(result.affectedRows || 0)) throw new Error('service inconnu');
    await query(
      'INSERT INTO aura_command_events(initiative_id,kind,payload,created_at) VALUES(NULL,?,?,?)',
      [
        'service-observation',
        JSON.stringify({ service_id: serviceId, state, detail, metadata: payload.metadata || {} }).slice(0, 30000),
        stamp,
      ],
    );
    return one('SELECT * FROM aura_command_services WHERE id=?', [serviceId]);
  }

  async initiatives(limit = 30, status = '') {
    const max = Math.max(1, Math.min(Number(limit) || 30, 100));
    const normalizedStatus = String(status || '').trim().slice(0, 40);
    const rows = normalizedStatus
      ? await query(
        `SELECT * FROM aura_initiatives WHERE status=? ORDER BY priority DESC,updated_at DESC LIMIT ?`,
        [normalizedStatus, max],
      )
      : await query(
        `SELECT * FROM aura_initiatives ORDER BY updated_at DESC LIMIT ?`,
        [max],
      );
    return rows.map((row) => ({
      ...row,
      priority: Number(row.priority || 0),
      confidence: Number(row.confidence || 0),
      attempts: Number(row.attempts || 0),
      requested_risks: parseJson(row.requested_risks, []),
      action_payload: parseJson(row.action_payload, {}),
      result: parseJson(row.result, {}),
    }));
  }

  async countRecentInitiatives() {
    const threshold = new Date(Date.now() - 3600_000).toISOString();
    const row = await one(
      'SELECT COUNT(*) AS total FROM aura_initiatives WHERE created_at>=?',
      [threshold],
    );
    return Number(row?.total || 0);
  }

  async existingInitiative(candidate) {
    const active = await one(
      `SELECT id,status,updated_at FROM aura_initiatives
       WHERE fingerprint=? AND status IN ('queued','running','waiting')
       ORDER BY updated_at DESC LIMIT 1`,
      [candidate.fingerprint],
    );
    if (active) return active;
    const threshold = new Date(Date.now() - config.commandCenterCooldownSeconds * 1000).toISOString();
    return one(
      `SELECT id,status,updated_at FROM aura_initiatives
       WHERE fingerprint=? AND updated_at>=?
       ORDER BY updated_at DESC LIMIT 1`,
      [candidate.fingerprint, threshold],
    );
  }

  candidate(input) {
    const risks = normalizeRisks(input.requested_risks || config.commandCenterAllowedRisks);
    const domain = String(input.domain || 'aura').slice(0, 80);
    const kind = String(input.kind || 'reflection').slice(0, 40);
    const objective = String(input.objective || '').replace(/\s+/g, ' ').trim().slice(0, 8000);
    return {
      ...input,
      domain,
      kind,
      objective,
      title: String(input.title || objective || 'Initiative AURA').slice(0, 240),
      rationale: String(input.rationale || '').slice(0, 5000),
      priority: clamp(input.priority ?? 0.5),
      confidence: clamp(input.confidence ?? 0.5),
      requested_risks: risks,
      action_type: String(input.action_type || '').slice(0, 120),
      action_payload: input.action_payload && typeof input.action_payload === 'object'
        ? input.action_payload
        : {},
      fingerprint: fingerprint([domain, kind, input.signature || objective]),
    };
  }

  async buildCandidates() {
    const [intentions, improvements, outcomes, services, bridgeStatus] = await Promise.all([
      this.kernel.intentions(8),
      this.kernel.improvements(8),
      query(
        `SELECT automation_id,event_type,ok,signature,created_at
         FROM aura_outcomes ORDER BY id DESC LIMIT 24`,
      ),
      this.services(),
      this.bridge?.status?.() || Promise.resolve({ enabled: false, worker_online: false }),
    ]);
    const candidates = [];

    for (const service of services) {
      if (!service.enabled || !BAD_SERVICE_STATES.has(String(service.state || '').toLowerCase())) continue;
      candidates.push(this.candidate({
        domain: service.id,
        kind: 'operator',
        title: `Rétablir ${service.name}`,
        objective:
          `Diagnostiquer l’état ${service.state} de ${service.name}. `
          + `Objectif produit: ${service.objective || 'rétablir le service'}. `
          + `Commencer par une vérification réversible. Ne pas effectuer d’action irréversible.`,
        rationale: service.state_detail || `Service déclaré ${service.state}.`,
        priority: Math.min(0.98, 0.66 + Number(service.criticality || 0.5) * 0.30),
        confidence: 0.9,
        signature: `service:${service.id}:${service.state}`,
      }));
    }

    const recentFailures = new Map();
    for (const row of outcomes) {
      if (Boolean(row.ok)) continue;
      const key = `${row.automation_id}:${row.signature}`;
      const current = recentFailures.get(key) || { ...row, count: 0 };
      current.count += 1;
      recentFailures.set(key, current);
    }
    for (const failure of [...recentFailures.values()].filter((item) => item.count >= 2).slice(0, 3)) {
      candidates.push(this.candidate({
        domain: 'aura',
        kind: 'operator',
        title: 'Traiter un échec récurrent',
        objective:
          `Diagnostiquer l’échec récurrent ${failure.automation_id}: ${failure.signature}. `
          + `Chercher la cause, appliquer seulement une correction réversible et vérifier le résultat.`,
        rationale: `${failure.count} occurrences récentes.`,
        priority: Math.min(0.97, 0.72 + failure.count * 0.06),
        confidence: Math.min(0.96, 0.68 + failure.count * 0.07),
        signature: `failure:${failure.automation_id}:${failure.signature}`,
      }));
    }

    const proposal = improvements.find((row) => String(row.status || '') === 'proposed');
    if (proposal) {
      candidates.push(this.candidate({
        domain: 'aura',
        kind: 'evolution',
        title: 'Faire évoluer AURA sur une faiblesse observée',
        objective:
          `Traiter l’amélioration proposée pour ${proposal.target}. `
          + `Diagnostic: ${proposal.diagnosis}. Proposition: ${proposal.proposal}. `
          + `Validation attendue: ${proposal.validation_plan}.`,
        rationale: `Amélioration persistante avec ${Number(proposal.evidence_count || 0)} preuve(s).`,
        priority: Math.min(0.96, 0.70 + Math.min(Number(proposal.evidence_count || 0), 6) * 0.04),
        confidence: Math.min(0.94, 0.65 + Math.min(Number(proposal.evidence_count || 0), 6) * 0.04),
        requested_risks: [],
        signature: `improvement:${proposal.id}`,
      }));
    }

    const topIntention = intentions.find((row) => Number(row.priority || 0) >= 0.55);
    if (topIntention) {
      candidates.push(this.candidate({
        domain: String(parseJson(topIntention.context, {})?.domain || 'aura').slice(0, 80),
        kind: 'operator',
        title: 'Faire avancer une intention active',
        objective:
          `Faire avancer concrètement cette intention AURA: ${topIntention.statement}. `
          + `Choisir une prochaine action courte, réversible, mesurable et compatible avec les capacités réellement disponibles.`,
        rationale: `Intention active priorité=${Number(topIntention.priority || 0).toFixed(2)}.`,
        priority: Math.min(0.92, Math.max(0.58, Number(topIntention.priority || 0.5))),
        confidence: 0.72,
        signature: `intention:${topIntention.id}`,
      }));
    }

    if (!bridgeStatus?.worker_online) {
      candidates.push(this.candidate({
        domain: 'quantic-studio',
        kind: 'reflection',
        title: 'Maintenir l’autonomie malgré le bras local hors ligne',
        objective:
          'Évaluer ce qu’AURA peut continuer à faire côté Cloud sans Quantic Studio, '
          + 'identifier les missions bloquées et préparer leur reprise dès le retour du worker local.',
        rationale: 'Le worker Quantic Studio n’est pas actuellement en ligne.',
        priority: 0.64,
        confidence: 0.98,
        requested_risks: [],
        signature: 'bridge-offline',
      }));
    }

    if (!candidates.length) {
      candidates.push(this.candidate({
        domain: 'quantic-sillage',
        kind: 'reflection',
        title: 'Revue autonome de l’écosystème',
        objective:
          'Passer en revue les intentions, leçons, résultats et travaux récents de Quantic Sillage. '
          + 'Déterminer s’il existe une prochaine action utile; ne rien inventer si aucun signal concret ne le justifie.',
        rationale: 'Aucune urgence ni faiblesse prioritaire détectée.',
        priority: 0.42,
        confidence: 0.78,
        requested_risks: [],
        signature: 'ecosystem-review',
      }));
    }

    return candidates
      .filter((candidate) => candidate.objective && candidate.confidence >= config.commandCenterMinConfidence)
      .sort((a, b) => (b.priority + b.confidence * 0.15) - (a.priority + a.confidence * 0.15));
  }

  async persistInitiative(candidate) {
    const existing = await this.existingInitiative(candidate);
    if (existing) return { created: false, initiative: existing };

    const id = randomUUID();
    const stamp = now();
    await query(
      `INSERT INTO aura_initiatives(
        id,fingerprint,domain,kind,title,objective,rationale,priority,confidence,requested_risks,
        action_type,action_payload,status,execution_mode,result,error,attempts,last_attempt_at,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'queued','','{}','',0,'',?,?)`,
      [
        id,
        candidate.fingerprint,
        candidate.domain,
        candidate.kind,
        candidate.title,
        candidate.objective,
        candidate.rationale,
        candidate.priority,
        candidate.confidence,
        JSON.stringify(candidate.requested_risks || []),
        candidate.action_type || '',
        JSON.stringify(candidate.action_payload || {}).slice(0, 30000),
        stamp,
        stamp,
      ],
    );
    await query(
      'INSERT INTO aura_command_events(initiative_id,kind,payload,created_at) VALUES(?,?,?,?)',
      [id, 'initiative-created', JSON.stringify(candidate).slice(0, 30000), stamp],
    );
    return {
      created: true,
      initiative: await one('SELECT * FROM aura_initiatives WHERE id=?', [id]),
    };
  }

  async updateInitiative(id, updates = {}) {
    const allowed = {
      status: String(updates.status || '').slice(0, 40),
      execution_mode: String(updates.execution_mode || '').slice(0, 80),
      result: JSON.stringify(updates.result || {}).slice(0, 100000),
      error: String(updates.error || '').slice(0, 5000),
      last_attempt_at: String(updates.last_attempt_at || now()).slice(0, 40),
    };
    await query(
      `UPDATE aura_initiatives
       SET status=?,execution_mode=?,result=?,error=?,
           attempts=attempts+1,last_attempt_at=?,updated_at=?
       WHERE id=?`,
      [
        allowed.status,
        allowed.execution_mode,
        allowed.result,
        allowed.error,
        allowed.last_attempt_at,
        now(),
        String(id),
      ],
    );
  }

  async executeInitiative(row) {
    const initiative = {
      ...row,
      requested_risks: parseJson(row.requested_risks, []),
      action_payload: parseJson(row.action_payload, {}),
    };
    const id = initiative.id;
    const bridgeOnline = this.bridge?.enabled && await this.bridge.workerOnline().catch(() => false);

    if (!config.commandCenterAutoExecute) {
      await this.updateInitiative(id, {
        status: 'waiting',
        execution_mode: 'autonomy-disabled',
        result: { reason: 'AURA_COMMAND_CENTER_AUTO_EXECUTE=false' },
      });
      return { id, status: 'waiting', reason: 'auto execution disabled' };
    }

    if (initiative.kind === 'operator' && !bridgeOnline) {
      await this.updateInitiative(id, {
        status: 'waiting',
        execution_mode: 'waiting-local-worker',
        result: { reason: 'Quantic Studio worker offline' },
      });
      return { id, status: 'waiting', reason: 'worker offline' };
    }

    await query(
      "UPDATE aura_initiatives SET status='running',updated_at=? WHERE id=?",
      [now(), id],
    );

    try {
      let result;
      let executionMode;

      if (initiative.kind === 'github') {
        const githubResult = await this.executeGithubInitiative(initiative);
        executionMode = githubResult.execution_mode;
        result = githubResult.result;
        const status = githubResult.status;
        await this.updateInitiative(id, {
          status,
          execution_mode: executionMode,
          result,
        });
        this.lastActionAt = now();
        await query(
          'INSERT INTO aura_command_events(initiative_id,kind,payload,created_at) VALUES(?,?,?,?)',
          [id, 'initiative-result', JSON.stringify({ status, executionMode, result }).slice(0, 30000), now()],
        );
        if (status === 'completed') {
          await this.kernel.recordOutcome({
            automation_id: `command-center:${initiative.domain}`,
            event_type: 'aura.initiative.github',
            ok: true,
            signature: 'success',
            report: { initiative_id: id, title: initiative.title, result },
            created_at: now(),
          });
        }
        return { id, status, execution_mode: executionMode, result };
      } else if (initiative.kind === 'evolution') {
        executionMode = bridgeOnline ? 'evolution-hybrid' : 'evolution-cloud';
        result = await this.evolution.dispatchCycle(
          initiative.objective,
          'command-center',
        );
      } else if (initiative.kind === 'operator') {
        executionMode = 'quantic-studio-operator';
        result = await this.kernel.operate(
          initiative.objective,
          initiative.requested_risks,
        );
      } else {
        executionMode = 'native-reflection';
        result = await this.kernel.tick({
          trigger: 'command-center',
          text: initiative.objective,
          force: true,
        });
      }

      const executed = initiative.kind !== 'operator' || Boolean(result?.executed || result?.queued);
      const status = result?.queued ? 'waiting' : 'completed';
      await this.updateInitiative(id, {
        status,
        execution_mode: executionMode,
        result,
      });
      this.lastActionAt = now();
      await query(
        'INSERT INTO aura_command_events(initiative_id,kind,payload,created_at) VALUES(?,?,?,?)',
        [id, 'initiative-result', JSON.stringify({ status, executionMode, result }).slice(0, 30000), now()],
      );
      if (status === 'completed') {
        await this.kernel.recordOutcome({
          automation_id: `command-center:${initiative.domain}`,
          event_type: `aura.initiative.${initiative.kind}`,
          ok: Boolean(executed),
          signature: executed ? 'success' : (result?.reason || 'not-executed'),
          report: { initiative_id: id, title: initiative.title, result },
          created_at: now(),
        });
      }
      return { id, status, execution_mode: executionMode, result };
    } catch (error) {
      const message = String(error?.message || error).slice(0, 5000);
      await this.updateInitiative(id, {
        status: 'failed',
        execution_mode: initiative.kind,
        error: message,
        result: {},
      });
      await query(
        'INSERT INTO aura_command_events(initiative_id,kind,payload,created_at) VALUES(?,?,?,?)',
        [id, 'initiative-error', JSON.stringify({ error: message }).slice(0, 30000), now()],
      );
      await this.kernel.recordOutcome({
        automation_id: `command-center:${initiative.domain}`,
        event_type: `aura.initiative.${initiative.kind}`,
        ok: false,
        signature: message,
        report: { initiative_id: id, title: initiative.title, error: message },
        created_at: now(),
      });
      throw error;
    }
  }

  async reconcileWaiting() {
    const rows = await query(
      `SELECT * FROM aura_initiatives
       WHERE status='waiting'
       ORDER BY priority DESC,updated_at ASC LIMIT 12`,
    );
    const reconciled = [];
    const workerOnline = this.bridge?.enabled
      && await this.bridge.workerOnline().catch(() => false);

    for (const row of rows) {
      const stored = parseJson(row.result, {});
      const jobId = String(stored?.job_id || stored?.result?.job_id || '').trim();

      if (!jobId) {
        if (row.execution_mode === 'waiting-local-worker' && workerOnline) {
          reconciled.push(await this.executeInitiative(row));
        }
        continue;
      }

      const job = await this.bridge.getJob(jobId).catch(() => null);
      if (!job || ['queued', 'leased'].includes(String(job.status || ''))) continue;

      if (job.status === 'completed') {
        const payload = job.result || {};
        await query(
          `UPDATE aura_initiatives
           SET status='completed',execution_mode='quantic-studio-operator',
               result=?,error='',updated_at=?
           WHERE id=?`,
          [JSON.stringify(payload).slice(0, 100000), now(), row.id],
        );
        await this.kernel.recordOutcome({
          automation_id: `command-center:${row.domain}`,
          event_type: `aura.initiative.${row.kind}`,
          ok: payload?.ok !== false,
          signature: payload?.ok === false
            ? String(payload?.error || 'worker-result-failed')
            : 'success',
          report: { initiative_id: row.id, job_id: jobId, result: payload },
          created_at: now(),
        });
        reconciled.push({ id: row.id, status: 'completed', job_id: jobId });
      } else if (job.status === 'error') {
        const message = String(job.error || 'worker execution failed').slice(0, 5000);
        await query(
          `UPDATE aura_initiatives
           SET status='failed',error=?,updated_at=?
           WHERE id=?`,
          [message, now(), row.id],
        );
        await this.kernel.recordOutcome({
          automation_id: `command-center:${row.domain}`,
          event_type: `aura.initiative.${row.kind}`,
          ok: false,
          signature: message,
          report: { initiative_id: row.id, job_id: jobId, error: message },
          created_at: now(),
        });
        reconciled.push({ id: row.id, status: 'failed', job_id: jobId });
      }
    }
    return reconciled;
  }

  async runCycle(trigger = 'manual') {
    if (!config.commandCenterEnabled) {
      return { ok: false, skipped: true, reason: 'command center disabled' };
    }
    if (this.running) {
      return { ok: true, skipped: true, reason: 'command center cycle already running' };
    }
    this.running = true;
    try {
      const reconciled = await this.reconcileWaiting();
      if (await this.countRecentInitiatives() >= config.commandCenterMaxInitiativesPerHour) {
        this.lastCycleAt = now();
        return {
          ok: true,
          reconciled,
          skipped: true,
          reason: 'initiative hourly budget reached',
        };
      }
      const fleet = await this.scanGithubFleet().catch((error) => {
        this.lastError = String(error?.message || error).slice(0, 1000);
        return this.fleetSnapshot;
      });
      const candidates = [
        ...this.githubCandidates(fleet),
        ...(await this.buildCandidates()),
      ].sort((a, b) => (b.priority + b.confidence * 0.15) - (a.priority + a.confidence * 0.15));
      let selected = null;
      for (const candidate of candidates) {
        const persisted = await this.persistInitiative(candidate);
        if (!persisted.created) continue;
        selected = persisted.initiative;
        break;
      }
      this.lastCycleAt = now();
      if (!selected) {
        return {
          ok: true,
          reconciled,
          skipped: true,
          reason: 'all candidates are cooling down',
          candidates: candidates.length,
        };
      }
      const result = await this.executeInitiative(selected);
      this.lastError = '';
      return {
        ok: true,
        trigger,
        candidate_count: candidates.length,
        reconciled,
        initiative: result,
      };
    } catch (error) {
      this.lastError = String(error?.message || error).slice(0, 1000);
      throw error;
    } finally {
      this.running = false;
    }
  }

  async retryInitiative(id) {
    const row = await one('SELECT * FROM aura_initiatives WHERE id=?', [String(id)]);
    if (!row) throw new Error('initiative inconnue');
    if (ACTIVE_STATUSES.has(String(row.status || '')) && row.status !== 'waiting') {
      throw new Error(`initiative déjà active: ${row.status}`);
    }
    return this.executeInitiative(row);
  }

  async status({ publicView = true } = {}) {
    const [counts, bridgeStatus, services] = await Promise.all([
      one(
        `SELECT COUNT(*) AS total,
          SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued,
          SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) AS running,
          SUM(CASE WHEN status='waiting' THEN 1 ELSE 0 END) AS waiting,
          SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
         FROM aura_initiatives`,
      ),
      this.bridge?.status?.() || Promise.resolve({ enabled: false, worker_online: false }),
      this.services(),
    ]);
    const degraded = services.filter((item) => BAD_SERVICE_STATES.has(String(item.state || '').toLowerCase()));
    const fleet = this.fleetSnapshot || [];
    const fleetObserved = fleet.filter((item) => item.state !== 'unknown');
    const fleetScore = fleetObserved.length
      ? Math.round(fleetObserved.reduce((sum, item) => sum + Number(item.health_score || 0), 0) / fleetObserved.length)
      : null;
    const topInitiative = await one(
      `SELECT id,domain,kind,title,objective,priority,confidence,status,execution_mode,updated_at
       FROM aura_initiatives
       WHERE status IN ('queued','running','waiting')
       ORDER BY priority DESC,confidence DESC,updated_at DESC LIMIT 1`,
    );
    const payload = {
      version: CommandCenter.VERSION,
      enabled: config.commandCenterEnabled,
      started: this.started,
      running: this.running,
      auto_execute: config.commandCenterAutoExecute,
      autonomy_mode: 'continuous-native-initiative-with-bounded-execution',
      tick_seconds: config.commandCenterTickSeconds,
      max_initiatives_per_hour: config.commandCenterMaxInitiativesPerHour,
      min_confidence: config.commandCenterMinConfidence,
      local_worker_online: Boolean(bridgeStatus?.worker_online),
      github_write_authority: Boolean(this.githubToken),
      monitored_repositories: config.commandCenterGithubRepos.length,
      fleet: {
        score: fleetScore,
        healthy: fleet.filter((item) => item.state === 'healthy').length,
        degraded: fleet.filter((item) => item.state === 'degraded').length,
        unavailable: fleet.filter((item) => ['error','unknown'].includes(item.state)).length,
        last_scan_at: this.lastFleetPollAt,
      },
      top_initiative: topInitiative ? {
        id: topInitiative.id,
        domain: topInitiative.domain,
        kind: topInitiative.kind,
        title: topInitiative.title,
        objective: String(topInitiative.objective || '').slice(0, 500),
        priority: Number(topInitiative.priority || 0),
        confidence: Number(topInitiative.confidence || 0),
        status: topInitiative.status,
        execution_mode: topInitiative.execution_mode,
        updated_at: topInitiative.updated_at,
      } : null,
      last_cycle_at: this.lastCycleAt,
      last_action_at: this.lastActionAt,
      last_error: this.lastError,
      services: {
        total: services.length,
        degraded: degraded.length,
        observed: services.filter((item) => item.last_observed_at).length,
      },
      counts: {
        total: Number(counts?.total || 0),
        queued: Number(counts?.queued || 0),
        running: Number(counts?.running || 0),
        waiting: Number(counts?.waiting || 0),
        completed: Number(counts?.completed || 0),
        failed: Number(counts?.failed || 0),
      },
    };
    if (!publicView) {
      payload.allowed_risks = [...config.commandCenterAllowedRisks];
      payload.service_registry = services;
      payload.repository_fleet = fleet;
    }
    return payload;
  }
}
