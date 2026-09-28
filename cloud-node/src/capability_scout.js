import { config } from './config.js';
import { one, query } from './db.js';

const now = () => new Date().toISOString();

const PERMISSIVE_LICENSES = new Set([
  'mit',
  'apache-2.0',
  'bsd-2-clause',
  'bsd-3-clause',
  'isc',
  'mpl-2.0',
  'unlicense',
  '0bsd',
]);

const REVIEW_LICENSES = new Set([
  'gpl-2.0',
  'gpl-3.0',
  'lgpl-2.1',
  'lgpl-3.0',
  'agpl-3.0',
]);

const OWN_REPOSITORIES = new Set([
  'xdsawyerlol/auralive',
  'xdsawyerlol/quanticsillage',
  'xdsawyerlol/quanticmail',
  'xdsawyerlol/quantic-os',
  'xdsawyerlol/quantic-browser',
  'xdsawyerlol/human-agency-engine',
]);

const SCOUT_THEMES = Object.freeze([
  {
    id: 'autonomous-research',
    label: 'Recherche et expérimentation autonome',
    queries: [
      'autonomous research agent ai',
      'agent experiment framework llm',
      'scientific discovery agent',
    ],
    signals: ['agent','research','experiment','scientist','autonomous','hypothesis','evaluation'],
  },
  {
    id: 'software-agents',
    label: 'Ingénierie logicielle autonome',
    queries: [
      'software agent sdk ai',
      'coding agent sandbox',
      'autonomous code agent',
    ],
    signals: ['software','coding','agent','sandbox','developer','repository','git'],
  },
  {
    id: 'local-voice',
    label: 'Voix locale expressive',
    queries: [
      'local text to speech voice cloning',
      'open source expressive tts',
      'streaming tts local ai',
    ],
    signals: ['tts','speech','voice','audio','local','multilingual','emotion'],
  },
  {
    id: 'vision-editing',
    label: 'Vision et édition d’image',
    queries: [
      'image editing diffusion open source',
      'vision image edit local ai',
      'multimodal image editing',
    ],
    signals: ['image','vision','edit','diffusion','multimodal','segmentation','generation'],
  },
  {
    id: 'browser-agents',
    label: 'Navigation et usage du Web',
    queries: [
      'browser automation ai agent',
      'computer use agent browser',
      'web agent open source',
    ],
    signals: ['browser','web','automation','computer','agent','playwright','puppeteer'],
  },
  {
    id: 'memory-knowledge',
    label: 'Mémoire et représentation des connaissances',
    queries: [
      'agent memory knowledge graph ai',
      'long term memory llm agent',
      'local vector graph memory',
    ],
    signals: ['memory','graph','knowledge','vector','retrieval','rag','persistent'],
  },
  {
    id: 'edge-distributed',
    label: 'Calcul distribué et frugal',
    queries: [
      'distributed ai agent edge',
      'wasm ai inference edge',
      'local inference orchestration open source',
    ],
    signals: ['edge','distributed','wasm','local','inference','orchestration','peer'],
  },
  {
    id: 'avatar-video',
    label: 'Avatar et présence multimodale',
    queries: [
      'audio driven avatar open source',
      'talking avatar local ai',
      'video avatar diffusion open source',
    ],
    signals: ['avatar','video','audio','talking','identity','diffusion','realtime'],
  },
]);

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function normalizeLicense(value) {
  return String(value || '').trim().toLowerCase();
}

export function licenseAssessment(value) {
  const id = normalizeLicense(value);
  if (PERMISSIVE_LICENSES.has(id)) {
    return { id: value || '', policy: 'compatible', score: 1, product_use: true };
  }
  if (REVIEW_LICENSES.has(id)) {
    return { id: value || '', policy: 'review', score: 0.52, product_use: 'conditional' };
  }
  if (!id || ['other','noassertion','none'].includes(id)) {
    return { id: value || '', policy: 'unknown', score: 0.18, product_use: false };
  }
  return { id: value || '', policy: 'review', score: 0.34, product_use: 'conditional' };
}

function recencyScore(date) {
  const stamp = Date.parse(String(date || ''));
  if (!Number.isFinite(stamp)) return 0.1;
  const ageDays = Math.max(0, (Date.now() - stamp) / 86_400_000);
  if (ageDays <= 30) return 1;
  if (ageDays <= 90) return 0.88;
  if (ageDays <= 180) return 0.72;
  if (ageDays <= 365) return 0.52;
  if (ageDays <= 730) return 0.3;
  return 0.12;
}

function popularityScore(stars) {
  const value = Math.max(0, Number(stars || 0));
  return clamp(Math.log10(value + 1) / 4.5);
}

function signalScore(repo, theme) {
  const text = [
    repo?.name,
    repo?.full_name,
    repo?.description,
    ...(Array.isArray(repo?.topics) ? repo.topics : []),
  ].join(' ').toLowerCase();
  const signals = theme?.signals || [];
  if (!signals.length) return 0.5;
  const matches = signals.filter((token) => text.includes(token)).length;
  return clamp(matches / Math.min(4, signals.length));
}

function resourceAssessment(repo, readme = '') {
  const text = [repo?.description, readme].join(' ').toLowerCase();
  const heavySignals = [
    '24gb vram','40gb','48gb','80gb','multi-gpu','multiple gpu','cuda only',
    'a100','h100','4090','requires gpu','nvidia gpu',
  ];
  const moderateSignals = ['cuda','gpu','pytorch','diffusion','transformer'];
  const heavy = heavySignals.some((token) => text.includes(token));
  const moderate = !heavy && moderateSignals.some((token) => text.includes(token));
  return {
    class: heavy ? 'gpu-heavy' : moderate ? 'accelerator-preferred' : 'light-or-unknown',
    score: heavy ? 0.28 : moderate ? 0.62 : 0.9,
  };
}

function securityAssessment(repo, readme = '') {
  const text = [repo?.description, readme].join(' ').toLowerCase();
  const risky = [
    'execute arbitrary code',
    'executes llm-written code',
    'shell access',
    'computer control',
    'browser control',
    'docker socket',
    'root access',
  ].filter((token) => text.includes(token));
  return {
    score: risky.length ? Math.max(0.35, 0.78 - risky.length * 0.09) : 0.86,
    signals: risky,
  };
}

export function scoreRepository(repo, {
  theme = SCOUT_THEMES[0],
  readme = '',
  existingCapabilities = [],
} = {}) {
  const license = licenseAssessment(repo?.license?.spdx_id || repo?.license || '');
  const resource = resourceAssessment(repo, readme);
  const security = securityAssessment(repo, readme);
  const maintenance = recencyScore(repo?.pushed_at || repo?.updated_at);
  const popularity = popularityScore(repo?.stargazers_count);
  const relevance = signalScore(repo, theme);
  const existing = new Set(
    (existingCapabilities || []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean),
  );
  const candidateText = [
    repo?.name,
    repo?.description,
    ...(repo?.topics || []),
  ].join(' ').toLowerCase();
  const overlap = [...existing].filter((capability) =>
    capability.length >= 4 && candidateText.includes(capability)
  ).length;
  const novelty = clamp(0.88 - Math.min(overlap, 5) * 0.12);
  const archivedPenalty = repo?.archived ? 0.65 : 0;
  const forkPenalty = repo?.fork ? 0.12 : 0;

  const weighted =
    license.score * 0.22
    + maintenance * 0.19
    + relevance * 0.22
    + novelty * 0.16
    + resource.score * 0.08
    + security.score * 0.08
    + popularity * 0.05
    - archivedPenalty
    - forkPenalty;

  const score = clamp(weighted);
  return {
    score: Number(score.toFixed(4)),
    theme: theme?.id || 'general',
    license,
    maintenance: Number(maintenance.toFixed(4)),
    relevance: Number(relevance.toFixed(4)),
    novelty: Number(novelty.toFixed(4)),
    resource,
    security,
    popularity: Number(popularity.toFixed(4)),
    archived: Boolean(repo?.archived),
    fork: Boolean(repo?.fork),
    experiment_eligible: Boolean(
      score >= config.capabilityScoutExperimentMinScore
      && license.policy === 'compatible'
      && !repo?.archived
      && !repo?.fork
    ),
  };
}

export function scoutQuery(theme, index = 0) {
  const selected = theme || SCOUT_THEMES[0];
  const base = selected.queries[index % selected.queries.length];
  const pushed = new Date(Date.now() - 540 * 86_400_000).toISOString().slice(0, 10);
  return `${base} stars:>25 archived:false fork:false pushed:>${pushed}`;
}

function decodeReadme(payload) {
  const encoded = String(payload?.content || '').replace(/\s+/g, '');
  if (!encoded || payload?.encoding !== 'base64') return '';
  try {
    return Buffer.from(encoded, 'base64').toString('utf8').slice(0, 20_000);
  } catch {
    return '';
  }
}

function safeFinding(row) {
  return {
    repository: String(row.repository || ''),
    url: String(row.url || ''),
    description: String(row.description || '').slice(0, 500),
    theme: String(row.theme || ''),
    score: Number(row.score || 0),
    license: String(row.license || ''),
    license_policy: String(row.license_policy || ''),
    resource_class: String(row.resource_class || ''),
    experiment_eligible: Boolean(row.experiment_eligible),
    researched: Boolean(row.researched),
    research_confidence: Number(row.research_confidence || 0),
    research_status: String(row.research_status || ''),
    discovered_at: String(row.discovered_at || ''),
  };
}

export class CapabilityScout {
  static VERSION = 'aura-capability-scout-v1';

  constructor({ kernel, commandCenter, webSubstrate, fabric, evolution }) {
    this.kernel = kernel;
    this.commandCenter = commandCenter;
    this.webSubstrate = webSubstrate;
    this.fabric = fabric;
    this.evolution = evolution;
    this.started = false;
    this.running = false;
    this.timer = null;
    this.warmupTimer = null;
    this.lastRunAt = '';
    this.lastResearchAt = '';
    this.lastExperimentAt = '';
    this.lastError = '';
    this.lastTheme = '';
    this.totalScans = 0;
    this.totalFindings = 0;
    this.totalExperiments = 0;
    this.recent = [];
  }

  async start() {
    this.started = true;
    if (!config.capabilityScoutEnabled) return;
    const run = () => this.runCycle('ambient')
      .catch((error) => { this.lastError = String(error?.message || error).slice(0, 1000); });
    this.warmupTimer = setTimeout(run, config.capabilityScoutWarmupSeconds * 1000);
    this.timer = setInterval(run, config.capabilityScoutIntervalSeconds * 1000);
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

  async recentFindings(limit = 8) {
    const max = Math.max(1, Math.min(Number(limit) || 8, 20));
    const rows = await query(
      `SELECT title,content,context,created_at
       FROM aura_cognitive_traces
       WHERE kind='capability-scout'
       ORDER BY id DESC LIMIT ?`,
      [max],
    ).catch(() => []);
    return rows.map((row) => {
      let context = {};
      try { context = JSON.parse(row.context || '{}'); } catch {}
      return safeFinding({
        ...(context || {}),
        repository: context?.repository || row.title,
        description: context?.description || row.content,
        discovered_at: row.created_at,
      });
    });
  }

  async alreadySeen(repository) {
    const threshold = new Date(Date.now() - config.capabilityScoutDedupeDays * 86_400_000).toISOString();
    const row = await one(
      `SELECT id FROM aura_cognitive_traces
       WHERE kind='capability-scout'
         AND title=?
         AND created_at>=?
       ORDER BY id DESC LIMIT 1`,
      [String(repository), threshold],
    ).catch(() => null);
    return Boolean(row);
  }

  themeForCycle() {
    const slotMs = Math.max(1, config.capabilityScoutIntervalSeconds) * 1000;
    const slot = Math.floor(Date.now() / slotMs);
    return SCOUT_THEMES[slot % SCOUT_THEMES.length];
  }

  existingCapabilities() {
    const rows = this.fabric?.list?.({ includeDisabled: true }) || [];
    const values = [];
    for (const row of rows) {
      values.push(row?.id, row?.name, row?.kind, ...(row?.tags || []));
    }
    return values.filter(Boolean);
  }

  async searchTheme(theme) {
    const found = new Map();
    const queries = theme.queries.slice(0, config.capabilityScoutQueriesPerCycle);
    for (let i = 0; i < queries.length; i += 1) {
      const queryText = scoutQuery(theme, i);
      const endpoint = '/search/repositories?q='
        + encodeURIComponent(queryText)
        + '&sort=updated&order=desc&per_page='
        + config.capabilityScoutSearchResults;
      try {
        const response = await this.commandCenter.github(endpoint);
        for (const repo of Array.isArray(response?.data?.items) ? response.data.items : []) {
          const key = String(repo?.full_name || '').toLowerCase();
          if (!key || OWN_REPOSITORIES.has(key) || found.has(key)) continue;
          found.set(key, repo);
        }
      } catch (error) {
        this.lastError = String(error?.message || error).slice(0, 1000);
      }
    }
    return [...found.values()];
  }

  async inspect(repo, theme) {
    const fullName = String(repo?.full_name || '');
    let detail = repo || {};
    let readme = '';
    if (fullName) {
      try {
        const response = await this.commandCenter.github('/repos/' + fullName);
        detail = response?.data || detail;
      } catch {}
      try {
        const response = await this.commandCenter.github('/repos/' + fullName + '/readme');
        readme = decodeReadme(response?.data);
      } catch {}
    }
    const assessment = scoreRepository(detail, {
      theme,
      readme,
      existingCapabilities: this.existingCapabilities(),
    });
    return { repo: detail, readme, assessment };
  }

  async recordFinding(item, research = null) {
    const repo = item.repo || {};
    const assessment = item.assessment || {};
    const finding = {
      repository: String(repo.full_name || ''),
      url: String(repo.html_url || ''),
      description: String(repo.description || '').slice(0, 500),
      theme: assessment.theme || '',
      score: Number(assessment.score || 0),
      license: String(assessment.license?.id || ''),
      license_policy: String(assessment.license?.policy || ''),
      resource_class: String(assessment.resource?.class || ''),
      experiment_eligible: Boolean(assessment.experiment_eligible),
      researched: Boolean(research),
      research_confidence: Number(research?.confidence || 0),
      research_status: String(research?.epistemic_status || ''),
      discovered_at: now(),
    };
    await this.kernel.trace(
      'capability-scout',
      finding.repository,
      finding.description || 'Projet externe détecté par la veille autonome AURA.',
      finding,
    );
    this.recent.unshift(finding);
    this.recent = this.recent.slice(0, 12);
    this.totalFindings += 1;
    return finding;
  }

  async investigate(item) {
    if (!this.webSubstrate?.enabled) return null;
    const repo = item.repo || {};
    const assessment = item.assessment || {};
    const question = [
      'Évaluer factuellement ce projet GitHub public pour AURA:',
      repo.full_name + '.',
      'Déterminer sa capacité réelle, sa maintenance, ses besoins matériels,',
      'ses risques, sa licence et surtout ce qu’il apporte qui n’existe pas déjà dans AURA.',
      'Ne pas conclure à une intégration si la valeur ajoutée est faible ou redondante.',
      'Score de présélection interne=' + Number(assessment.score || 0).toFixed(2) + '.',
    ].join(' ');
    try {
      const result = await this.webSubstrate.research(question, {
        trigger: 'capability-scout',
      });
      this.lastResearchAt = now();
      return result;
    } catch (error) {
      this.lastError = String(error?.message || error).slice(0, 1000);
      return null;
    }
  }

  researchSupportsExperiment(result) {
    if (!result) return false;
    return ['corroborated','partially-supported'].includes(String(result.epistemic_status || ''))
      && Number(result.confidence || 0) >= config.capabilityScoutResearchMinConfidence
      && Number(result.evidence_count || 0) >= 2;
  }

  async experimentBudgetAvailable() {
    const threshold = new Date(Date.now() - 86_400_000).toISOString();
    const row = await one(
      `SELECT COUNT(*) AS total FROM aura_cognitive_traces
       WHERE kind='capability-experiment' AND created_at>=?`,
      [threshold],
    ).catch(() => ({ total: 0 }));
    return Number(row?.total || 0) < config.capabilityScoutMaxExperimentsPerDay;
  }

  async createIntention(item, finding, research) {
    const repo = item.repo || {};
    const assessment = item.assessment || {};
    const confidence = Math.max(
      Number(assessment.score || 0),
      Number(research?.confidence || 0),
    );
    return this.kernel.addIntention(
      `Évaluer puis expérimenter en sandbox si la valeur est confirmée: ${repo.full_name}. `
      + `But: extraire uniquement la capacité réellement additive pour AURA, sans empiler une dépendance redondante.`,
      {
        priority: Math.min(0.94, 0.66 + confidence * 0.28),
        source: 'capability-scout',
        context: {
          domain: 'aura-evolution',
          target: 'system',
          repository: repo.full_name,
          repository_url: repo.html_url,
          license: assessment.license?.id || '',
          license_policy: assessment.license?.policy || '',
          scout_score: assessment.score,
          research_session_id: research?.session_id || '',
          research_status: research?.epistemic_status || '',
          research_confidence: research?.confidence || 0,
          resource_class: assessment.resource?.class || '',
          discovered_at: finding.discovered_at,
        },
      },
    );
  }

  async maybeExperiment(item, finding, research) {
    if (!config.capabilityScoutAutoExperiment) return null;
    if (!item.assessment?.experiment_eligible) return null;
    if (!this.researchSupportsExperiment(research)) return null;
    if (!await this.experimentBudgetAvailable()) return null;

    const repo = item.repo || {};
    const objective = [
      'AURA Capability Scout a identifié un candidat externe à forte valeur potentielle.',
      `Projet: ${repo.full_name} (${repo.html_url || ''}).`,
      `Licence: ${item.assessment.license?.id || 'inconnue'}; politique=${item.assessment.license?.policy || 'unknown'}.`,
      `Score scout=${Number(item.assessment.score || 0).toFixed(2)}; preuves externes=${research?.epistemic_status || 'unknown'}; confiance=${Number(research?.confidence || 0).toFixed(2)}.`,
      'Mission: analyser le code et l’architecture du projet, comparer précisément avec les capacités AURA existantes,',
      'puis, seulement si une lacune réelle est démontrée, construire le plus petit prototype natif/adaptateur possible dans une branche dédiée.',
      'Ne jamais copier aveuglément le projet, ne jamais contourner sa licence, ne jamais ajouter une dépendance lourde sans justification.',
      'Mesurer le gain avec un test avant/après. Si le gain n’est pas démontré, conclure no-safe-patch.',
      'Toute modification reste soumise à compilation, tests, canary et politique branch-test-canary-promote.',
    ].join(' ');

    let result;
    try {
      result = await this.evolution.dispatchCycle(objective, 'capability-scout', {
        repository: config.evolutionRepository,
        base_branch: config.evolutionBaseBranch,
      });
      this.lastExperimentAt = now();
      this.totalExperiments += 1;
    } catch (error) {
      result = { status: 'error', error: String(error?.message || error).slice(0, 1000) };
      this.lastError = result.error;
    }
    await this.kernel.trace(
      'capability-experiment',
      repo.full_name,
      `Expérience autonome AURA: ${String(result?.status || 'unknown')}`,
      {
        repository: repo.full_name,
        scout_score: finding.score,
        research_status: finding.research_status,
        result_status: result?.status || 'unknown',
        delegated_to_local: Boolean(result?.delegated_to_local),
      },
    );
    return result;
  }

  async runCycle(trigger = 'manual') {
    if (!config.capabilityScoutEnabled) {
      return { ok: false, skipped: true, reason: 'capability scout disabled' };
    }
    if (this.running) {
      return { ok: true, skipped: true, reason: 'capability scout cycle already running' };
    }
    this.running = true;
    try {
      const theme = this.themeForCycle();
      this.lastTheme = theme.id;
      const repos = await this.searchTheme(theme);
      const unseen = [];
      for (const repo of repos) {
        if (unseen.length >= config.capabilityScoutInspectPerCycle) break;
        if (await this.alreadySeen(repo.full_name)) continue;
        unseen.push(repo);
      }

      const inspected = [];
      for (const repo of unseen) {
        inspected.push(await this.inspect(repo, theme));
      }
      inspected.sort((a, b) => Number(b.assessment?.score || 0) - Number(a.assessment?.score || 0));

      const shortlist = inspected
        .filter((item) => Number(item.assessment?.score || 0) >= config.capabilityScoutMinScore)
        .slice(0, config.capabilityScoutInvestigationsPerCycle);

      const findings = [];
      let experiment = null;
      for (const item of inspected.slice(0, config.capabilityScoutMaxFindingsPerCycle)) {
        let research = null;
        if (shortlist.includes(item)) research = await this.investigate(item);
        const finding = await this.recordFinding(item, research);
        findings.push(finding);

        if (shortlist.includes(item)) {
          await this.createIntention(item, finding, research);
          if (!experiment) {
            experiment = await this.maybeExperiment(item, finding, research);
          }
        }
      }

      this.totalScans += 1;
      this.lastRunAt = now();
      this.lastError = '';
      await this.kernel.observeEvent(
        'aura.capability_scout.cycle',
        {
          trigger,
          theme: theme.id,
          repositories_seen: repos.length,
          repositories_inspected: inspected.length,
          shortlisted: shortlist.length,
          experiment_started: Boolean(experiment),
        },
        'capability-scout',
      ).catch(() => {});

      return {
        ok: true,
        trigger,
        theme: { id: theme.id, label: theme.label },
        repositories_seen: repos.length,
        repositories_inspected: inspected.length,
        shortlisted: shortlist.length,
        findings,
        experiment,
      };
    } catch (error) {
      this.lastError = String(error?.message || error).slice(0, 1000);
      throw error;
    } finally {
      this.running = false;
    }
  }

  async status() {
    const persisted = await this.recentFindings(8);
    return {
      version: CapabilityScout.VERSION,
      enabled: config.capabilityScoutEnabled,
      started: this.started,
      running: this.running,
      autonomous: true,
      prompt_required: false,
      interval_seconds: config.capabilityScoutIntervalSeconds,
      queries_per_cycle: config.capabilityScoutQueriesPerCycle,
      min_score: config.capabilityScoutMinScore,
      experiment_min_score: config.capabilityScoutExperimentMinScore,
      auto_experiment: config.capabilityScoutAutoExperiment,
      max_experiments_per_day: config.capabilityScoutMaxExperimentsPerDay,
      last_run_at: this.lastRunAt,
      last_research_at: this.lastResearchAt,
      last_experiment_at: this.lastExperimentAt,
      last_theme: this.lastTheme,
      last_error: this.lastError,
      totals: {
        scans: this.totalScans,
        findings: this.totalFindings,
        experiments: this.totalExperiments,
      },
      recent_findings: persisted.length ? persisted : this.recent.slice(0, 8),
      policy: {
        zero_cost_preferred: true,
        permissive_license_preferred: true,
        no_blind_vendoring: true,
        experiment_before_integration: true,
        branch_test_canary_promote: true,
      },
    };
  }
}
