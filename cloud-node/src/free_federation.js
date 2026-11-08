import { config, databaseConfigured } from './config.js';
import { one, query } from './db.js';

const COMPLEX_ROLES = new Set(['reasoning', 'code', 'research', 'critic', 'security', 'evolution', 'math']);
// Protect interactive conversation from autonomous/background inference.
const INTERACTIVE_ROLES = new Set(['french', 'conversation', 'translation', 'manual-evaluation']);
const SAFE_OPENROUTER_MODEL = /^(?:openrouter\/free|[a-z0-9._-]+\/[a-z0-9._:-]+:free)$/i;
const EXCLUDED_SPECIALIST_TERMS = [
  'content safety',
  'prompt guard',
  'moderation',
  'embedding',
  'rerank',
  'transcription',
  'speech-to-text',
  'text-to-speech',
];

function roleName(value) {
  const role = String(value || 'auto').trim().toLowerCase().slice(0, 80);
  return role || 'auto';
}

function safeText(error) {
  return String(error?.message || error || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk-|AIza)[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
}

// OpenRouter chat responses can contain text parts rather than one string.
// Never turn message.reasoning or reasoning_details into spoken answers.
export function openRouterVisibleText(payload) {
  const content=payload?.choices?.[0]?.message?.content;
  if(typeof content==='string') return content.trim();
  if(!Array.isArray(content)) return '';
  return content
    .filter(part=>part && ['text','output_text'].includes(String(part.type||'text')))
    .map(part=>typeof part.text==='string'?part.text:'')
    .filter(Boolean).join('\n').trim();
}

export function openRouterEmptyDiagnostic(payload, requestedModel='openrouter/free') {
  const choice=payload?.choices?.[0]||{};
  const safe=(value)=>String(value||'unknown').replace(/[^a-z0-9_.:!/-]/gi,'').slice(0,110);
  const usage=payload?.usage||{};
  const output=Number(usage.completion_tokens ?? usage.output_tokens);
  const thinking=Number(usage.completion_tokens_details?.reasoning_tokens
    ?? usage.output_tokens_details?.reasoning_tokens);
  return {
    model:safe(payload?.model||requestedModel),
    finish_reason:safe(choice.finish_reason),
    completion_tokens:Number.isFinite(output)&&output>=0?output:null,
    reasoning_tokens:Number.isFinite(thinking)&&thinking>=0?thinking:null,
    reasoning_only:!openRouterVisibleText(payload)
      && (Number.isFinite(thinking)&&thinking>0
        || Boolean(choice?.message?.reasoning||choice?.message?.reasoning_details)),
  };
}

function clamp01(value, fallback = 0.5) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function exactZero(value) {
  if (value == null || value === '') return false;
  const number = Number(value);
  return Number.isFinite(number) && number === 0;
}

function modelText(model) {
  return [
    model?.id,
    model?.name,
    model?.description,
  ].map((item) => String(item || '').toLowerCase()).join(' ');
}

function roleAffinity(model, role) {
  const text = modelText(model);
  const keywords = {
    code: ['code', 'coding', 'software', 'terminal', 'developer', 'agentic'],
    evolution: ['code', 'coding', 'software', 'agentic', 'tool', 'workflow'],
    reasoning: ['reasoning', 'thinking', 'logic', 'science', 'problem solving'],
    critic: ['reasoning', 'verification', 'critic', 'analysis', 'thinking'],
    math: ['math', 'mathematics', 'reasoning', 'science'],
    research: ['research', 'knowledge', 'long-context', 'document', 'reasoning'],
    security: ['security', 'cyber', 'reasoning', 'code'],
    creative: ['creative', 'writing', 'multilingual', 'qwen', 'instruction'],
    redteam: ['abliterated', 'uncensored', 'red-team', 'adversarial', 'reasoning'],
    vision: ['vision', 'multimodal', 'image', 'visual'],
    'long-context': ['long-context', 'context', 'document', 'research'],
    conversation: ['conversation', 'general-purpose', 'multilingual', 'instruction'],
    french: ['french', 'français', 'francais', 'multilingual', 'mistral', 'qwen', 'conversation', 'instruction'],
    translation: ['translation', 'multilingual', 'language'],
  }[roleName(role)] || ['general-purpose', 'reasoning', 'instruction'];

  const hits = keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? 1 : 0), 0);
  return Math.min(1, hits / Math.max(2, Math.ceil(keywords.length / 2)));
}

function modelEligible(row) {
  const id = String(row?.id || '').trim();
  if (!isGuaranteedFreeOpenRouterModel(id)) return false;
  if (!exactZero(row?.pricing?.prompt) || !exactZero(row?.pricing?.completion)) return false;
  const outputs = Array.isArray(row?.architecture?.output_modalities)
    ? row.architecture.output_modalities.map((item) => String(item).toLowerCase())
    : [];
  if (outputs.length && !outputs.includes('text')) return false;
  const text = modelText(row);
  if (id !== 'openrouter/free' && EXCLUDED_SPECIALIST_TERMS.some((term) => text.includes(term))) {
    return false;
  }
  return true;
}

export function isGuaranteedFreeOpenRouterModel(model) {
  return SAFE_OPENROUTER_MODEL.test(String(model || '').trim());
}

export function isTrustedOpenRouterEndpoint(value) {
  try {
    const url = new URL(String(value || ''));
    return (
      url.protocol === 'https:'
      && url.hostname.toLowerCase() === 'openrouter.ai'
      && url.pathname.replace(/\/$/, '') === '/api/v1'
    );
  } catch {
    return false;
  }
}

export class ZeroCostFederation {
  constructor() {
    this.lastError = '';
    this.lastLatencyMs = 0;
    this.lastProvider = '';
    this.lastModel = '';
    this.lastRequestedModel = '';
    this.lastRole = '';
    this.quarantined = new Set();
    this.memoryUsage = new Map();
    this.catalog = [];
    this.catalogUpdatedAt = 0;
    this.catalogError = '';
    this.selectionCounter = 0;
    this.rateLimitUntilMs = 0;
    this.lastRateLimitAt = '';
  }

  get enabled() {
    return Boolean(
      config.zeroCostMode
      && config.freeFederationEnabled
      && config.openRouterApiKey
      && isTrustedOpenRouterEndpoint(config.openRouterBaseUrl)
      && this.#configuredModels().length,
    );
  }

  #configuredModels() {
    return config.openRouterFreeModels
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .filter(isGuaranteedFreeOpenRouterModel);
  }

  async #usage(provider) {
    const date = todayUtc();
    try {
      if (!databaseConfigured()) throw new Error('ledger-disabled');
      const row = await one(
        'SELECT requests,failures FROM aura_free_provider_usage WHERE provider=? AND usage_date=?',
        [provider, date],
      );
      if (row) {
        return {
          requests: Math.max(Number(row.requests || 0), Number(this.memoryUsage.get(`${provider}:${date}`)?.requests || 0)),
          failures: Number(row.failures || 0),
          source: 'mysql',
        };
      }
    } catch {
      // Keep AURA functional if the optional score ledger is temporarily unavailable.
    }
    const key = `${provider}:${date}`;
    return {
      requests: Number(this.memoryUsage.get(key)?.requests || 0),
      failures: Number(this.memoryUsage.get(key)?.failures || 0),
      source: 'memory',
    };
  }

  async budgetFor(role = 'auto') {
    const usage = await this.#usage('openrouter');
    const max = config.freeFederationMaxRequestsPerDay;
    const reserve = Math.min(config.freeFederationChatReserve, max);
    const isInteractive = INTERACTIVE_ROLES.has(roleName(role));
    const limit = isInteractive ? max : Math.max(0, max - reserve);
    return {
      requests: usage.requests,
      limit,
      available: Math.max(0, limit - usage.requests),
      chat_reserved: reserve,
      role: roleName(role),
      cooldown_until: this.rateLimitUntilMs > Date.now()
        ? new Date(this.rateLimitUntilMs).toISOString() : null,
    };
  }

  async #reserve(provider, role = 'auto') {
    if (Date.now() < this.rateLimitUntilMs) {
      throw new Error(`OpenRouter free HTTP 429: cooldown active until ${new Date(this.rateLimitUntilMs).toISOString()}`);
    }
    const budget = await this.budgetFor(role);
    if (budget.available < 1) {
      throw new Error(`${provider} free daily budget exhausted for ${role} (${budget.requests}/${budget.limit}; ${budget.chat_reserved} reserved for conversation)`);
    }
    const date = todayUtc();
    const key = `${provider}:${date}`;
    const current = this.memoryUsage.get(key) || { requests: 0, failures: 0 };
    this.memoryUsage.set(key, { ...current, requests: current.requests + 1 });
    try {
      if (!databaseConfigured()) throw new Error('ledger-disabled');
      await query(
        `INSERT INTO aura_free_provider_usage(provider,usage_date,requests,failures,last_status,updated_at)
         VALUES(?,?,1,0,'reserved',?)
         ON DUPLICATE KEY UPDATE requests=requests+1,last_status='reserved',updated_at=VALUES(updated_at)`,
        [provider, date, new Date().toISOString()],
      );
    } catch {
      // OpenRouter itself still enforces its own free-plan/model limits.
    }
  }

  async #markProvider(provider, ok, status = '') {
    const date = todayUtc();
    const key = `${provider}:${date}`;
    const current = this.memoryUsage.get(key) || { requests: 0, failures: 0 };
    if (!ok) this.memoryUsage.set(key, { ...current, failures: current.failures + 1 });
    try {
      if (!databaseConfigured()) throw new Error('ledger-disabled');
      await query(
        `INSERT INTO aura_free_provider_usage(provider,usage_date,requests,failures,last_status,updated_at)
         VALUES(?,?,0,?,?,?)
         ON DUPLICATE KEY UPDATE failures=failures+VALUES(failures),last_status=VALUES(last_status),updated_at=VALUES(updated_at)`,
        [provider, date, ok ? 0 : 1, String(status || '').slice(0, 120), new Date().toISOString()],
      );
    } catch {
      // Best-effort telemetry only.
    }
  }

  async #recordModel(provider, model, role, {
    success,
    latencyMs = 0,
    quality = null,
    error = '',
  }) {
    const safeProvider = String(provider || '').slice(0, 80);
    const safeModel = String(model || 'unknown').slice(0, 240);
    const safeRole = roleName(role);
    const q = quality == null ? null : clamp01(quality);
    try {
      if (!databaseConfigured()) throw new Error('ledger-disabled');
      await query(
        `INSERT INTO aura_free_model_scorecards(
           provider,model,role,calls,successes,failures,ema_latency_ms,ema_quality,last_error,updated_at
         ) VALUES(?,?,?,1,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           calls=calls+1,
           successes=successes+VALUES(successes),
           failures=failures+VALUES(failures),
           ema_latency_ms=CASE
             WHEN ema_latency_ms<=0 THEN VALUES(ema_latency_ms)
             ELSE (ema_latency_ms*0.82)+(VALUES(ema_latency_ms)*0.18)
           END,
           ema_quality=CASE
             WHEN VALUES(ema_quality) IS NULL THEN ema_quality
             WHEN ema_quality IS NULL THEN VALUES(ema_quality)
             ELSE (ema_quality*0.82)+(VALUES(ema_quality)*0.18)
           END,
           last_error=VALUES(last_error),
           updated_at=VALUES(updated_at)`,
        [
          safeProvider,
          safeModel,
          safeRole,
          success ? 1 : 0,
          success ? 0 : 1,
          Math.max(0, Number(latencyMs || 0)),
          q,
          success ? '' : safeText(error),
          new Date().toISOString(),
        ],
      );
    } catch {
      // Scoring must never turn a successful free inference into a failed mission.
    }
  }

  async #refreshCatalog() {
    if (!config.freeFederationDiscoverModels) return this.catalog;
    const freshForMs = config.freeFederationCatalogTtlSeconds * 1000;
    if (this.catalog.length && Date.now() - this.catalogUpdatedAt < freshForMs) return this.catalog;
    try {
      const response = await fetch(`${config.openRouterBaseUrl}/models`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${config.openRouterApiKey}`,
        },
        signal: AbortSignal.timeout(Math.min(config.freeFederationTimeoutMs, 15000)),
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(`OpenRouter catalog HTTP ${response.status}: ${raw.slice(0, 300)}`);
      const payload = raw ? JSON.parse(raw) : {};
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      this.catalog = rows
        .filter(modelEligible)
        .sort((a, b) => Number(b?.context_length || 0) - Number(a?.context_length || 0))
        .slice(0, config.freeFederationMaxCatalogModels);
      this.catalogUpdatedAt = Date.now();
      this.catalogError = '';
    } catch (error) {
      this.catalogError = safeText(error);
    }
    return this.catalog;
  }

  async #learnedScores(role, ids) {
    if (!databaseConfigured() || !ids.length) return new Map();
    try {
      const placeholders = ids.map(() => '?').join(',');
      const rows = await query(
        `SELECT model,calls,successes,failures,ema_latency_ms,ema_quality
         FROM aura_free_model_scorecards
         WHERE provider='openrouter' AND role=? AND model IN (${placeholders})`,
        [roleName(role), ...ids],
      );
      return new Map(rows.map((row) => [String(row.model), row]));
    } catch {
      return new Map();
    }
  }

  async #selectModel(role) {
    const configured = this.#configuredModels();
    const catalog = await this.#refreshCatalog();
    const verified = new Map(catalog.map((row) => [String(row.id), row]));

    // openrouter/free is an official zero-priced router and is retained as a safe fallback.
    const candidates = [];
    if (config.freeFederationDiscoverModels) {
      for (const row of catalog) {
        if (row.id !== 'openrouter/free') candidates.push(row);
      }
    }
    for (const id of configured) {
      if (id === 'openrouter/free') continue;
      const row = verified.get(id);
      if (row && !candidates.some((item) => item.id === id)) candidates.push(row);
    }

    if (!candidates.length) return 'openrouter/free';

    // Interactive French should produce an actual answer, not spend its
    // entire free completion budget in mandatory internal reasoning.
    const nonMandatory=INTERACTIVE_ROLES.has(roleName(role))
      ? candidates.filter((row)=>row?.reasoning?.mandatory!==true)
      : [];
    const speechCandidates=nonMandatory.length?nonMandatory:candidates;
    const learned = await this.#learnedScores(role, speechCandidates.map((row) => row.id));
    const ranked = speechCandidates.map((row) => {
      const stats = learned.get(row.id);
      const calls = Number(stats?.calls || 0);
      const successes = Number(stats?.successes || 0);
      const successRate = (successes + 1) / (calls + 2);
      const quality = stats?.ema_quality == null ? 0.5 : clamp01(stats.ema_quality);
      const latencyMs = Number(stats?.ema_latency_ms || 0);
      const latencyBonus = latencyMs > 0 ? Math.max(-0.08, 0.08 - latencyMs / 120000) : 0;
      const contextBonus = Math.min(0.08, Math.log10(Math.max(1000, Number(row.context_length || 0))) / 100);
      const tools = Array.isArray(row.supported_parameters) && row.supported_parameters.includes('tools') ? 0.04 : 0;
      const affinity = roleAffinity(row, role);
      return {
        id: row.id,
        score: (0.28 * successRate) + (0.16 * quality) + (0.38 * affinity) + latencyBonus + contextBonus + tools,
        calls,
      };
    }).sort((a, b) => b.score - a.score || a.calls - b.calls || a.id.localeCompare(b.id));

    this.selectionCounter += 1;
    const exploreEvery = Math.max(2, Math.round(1 / Math.max(0.01, config.freeFederationExploration)));
    if (ranked.length > 1 && this.selectionCounter % exploreEvery === 0) {
      return ranked[1].id;
    }
    return ranked[0].id;
  }

  // Recover an empty free-router reply only with a live zero-price,
  // text-capable model; do not expose hidden reasoning as an answer.
  async #recoveryModel(role, failedModel) {
    if (!INTERACTIVE_ROLES.has(roleName(role))) return '';
    const catalog = await this.#refreshCatalog();
    const candidates = catalog.filter((row) =>
      row.id !== failedModel
      && row.id !== 'openrouter/free'
      && modelEligible(row)
      && row?.reasoning?.mandatory !== true
    );
    candidates.sort((a, b) =>
      roleAffinity(b, role) - roleAffinity(a, role)
      || Number(b.context_length || 0) - Number(a.context_length || 0)
      || String(a.id).localeCompare(String(b.id))
    );
    return String(candidates[0]?.id || '');
  }

  async #assertCatalogFree(model) {
    if (model === 'openrouter/free') return true;
    const catalog = await this.#refreshCatalog();
    const row = catalog.find((item) => String(item?.id || '') === model);
    if (!row || !modelEligible(row)) {
      throw new Error(`Blocked model without current zero-price proof: ${model}`);
    }
    return true;
  }

  async #openRouter(prompt, system, maxTokens, role, requestedModel) {
    if (this.quarantined.has('openrouter')) throw new Error('OpenRouter free provider quarantined');
    if (!isTrustedOpenRouterEndpoint(config.openRouterBaseUrl)) {
      throw new Error('Blocked untrusted OpenRouter endpoint');
    }
    if (!isGuaranteedFreeOpenRouterModel(requestedModel)) {
      throw new Error('Blocked non-guaranteed-free OpenRouter model');
    }
    await this.#assertCatalogFree(requestedModel);

    await this.#reserve('openrouter', role);
    const started = Date.now();
    let response;
    let body;
    try {
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${config.openRouterApiKey}`,
        'X-Title': 'AURA Quantic Sillage',
      };
      if (config.publicBaseUrl) headers['HTTP-Referer'] = config.publicBaseUrl;

      const interactive = INTERACTIVE_ROLES.has(roleName(role));
      const meta=this.catalog.find(item=>item.id===requestedModel);
      const reason=meta?.reasoning;
      const efforts=Array.isArray(reason?.supported_efforts)?reason.supported_efforts:[];
      // Only request a supported reasoning level. Dynamic openrouter/free has
      // no published reasoning contract: do not send unsupported parameters.
      const reducedReasoning=interactive && reason?.mandatory!==true
        ? (efforts.includes('none') ? {effort:'none'}
          : efforts.includes('minimal') ? {effort:'minimal'} : null) : null;
      const requestBody={
        model:requestedModel,
        messages:[
          { role:'system',content:String(system||'') },
          { role:'user',content:String(prompt||'') },
        ],
        temperature:interactive ? 0.45 :
          (Number.isFinite(config.aiTemperature) ? config.aiTemperature : 0.65),
        // Reasoning-only completions can use all 200-300 tokens. Preserve
        // sufficient room for the visible French answer on free models.
        max_tokens:interactive
          ? Math.max(900,Math.min(Number(maxTokens)||900,1400))
          : Math.max(64,Math.min(Number(maxTokens)||700,4000)),
        stream:false,
        usage:{include:true},
      };
      if(reducedReasoning)requestBody.reasoning=reducedReasoning;
      response = await fetch(`${config.openRouterBaseUrl}/chat/completions`, {
        method:'POST',headers,
        body:JSON.stringify(requestBody),
        signal:AbortSignal.timeout(config.freeFederationTimeoutMs),
      });

      const raw = await response.text();
      if (response.status === 429) {
        const retryHeader = String(response.headers?.get?.('retry-after') || '').trim();
        const retrySeconds = /^\d+$/.test(retryHeader) ? Number(retryHeader) : NaN;
        const retryDateMs = Number.isFinite(Date.parse(retryHeader)) ? Date.parse(retryHeader) - Date.now() : NaN;
        const retryMs = Number.isFinite(retrySeconds) ? retrySeconds * 1000
          : (Number.isFinite(retryDateMs) ? retryDateMs : 5 * 60 * 1000);
        this.rateLimitUntilMs = Date.now() + Math.max(30_000, Math.min(60 * 60 * 1000, retryMs));
        this.lastRateLimitAt = new Date().toISOString();
      }
      if (!response.ok) {
        throw new Error(`OpenRouter free HTTP ${response.status}: ${raw.slice(0, 500)}`);
      }
      body = raw ? JSON.parse(raw) : {};
      const cost = Number(body?.usage?.cost ?? body?.usage?.cost_details?.upstream_inference_cost ?? 0);
      if (Number.isFinite(cost) && cost > 0) {
        this.quarantined.add('openrouter');
        throw new Error(`ZERO_COST_INVARIANT_VIOLATION: OpenRouter reported cost ${cost}`);
      }

      const answer = openRouterVisibleText(body);
      if(!answer){
        const info=openRouterEmptyDiagnostic(body,requestedModel);
        throw new Error('OpenRouter free response empty: model='+info.model
          +' finish='+info.finish_reason
          +' reasoning_only='+info.reasoning_only
          +' output_tokens='+(info.completion_tokens??'unknown')
          +' reasoning_tokens='+(info.reasoning_tokens??'unknown'));
      }
      const actualModel = String(body?.model || requestedModel).trim().slice(0, 240);
      const latencyMs = Date.now() - started;
      await this.#markProvider('openrouter', true, String(response.status));
      await this.#recordModel('openrouter', actualModel, role, {
        success: true,
        latencyMs,
      });
      return {
        answer,
        provider: 'openrouter',
        model: actualModel,
        requestedModel,
        latencyMs,
        costMicrounits: 0,
      };
    } catch (error) {
      const latencyMs = Date.now() - started;
      const actualModel = String(body?.model || requestedModel).trim().slice(0, 240);
      await this.#markProvider('openrouter', false, String(response?.status || 'error'));
      await this.#recordModel('openrouter', actualModel, role, {
        success: false,
        latencyMs,
        error,
      });
      throw error;
    }
  }

  async generate(prompt, system, maxTokens = 700, taskRole = 'auto') {
    if (!this.enabled) return null;
    const role = roleName(taskRole);
    const requestedModel = await this.#selectModel(role);
    const started = Date.now();
    try {
      let result;
      try {
        result = await this.#openRouter(prompt, system, maxTokens, role, requestedModel);
      } catch (primaryError) {
        const failure = safeText(primaryError);
        // Account restrictions, quota and financial guard failures should
        // never trigger a second call, paid or free.
        if (this.quarantined.has('openrouter')
          || /\bhttp\s*(?:401|402|403|429)\b|budget.exhausted|daily.budget.exhausted|cooldown.active/i.test(failure)) {
          throw primaryError;
        }
        const empty = /openrouter free response empty/i.test(failure);
        // The dynamic router can select a model that spends all completion
        // tokens on hidden reasoning. One verified alternative is enough.
        const verifiedAlternative = empty ? await this.#recoveryModel(role, requestedModel) : '';
        const recoveryModel = verifiedAlternative
          || (requestedModel !== 'openrouter/free' ? 'openrouter/free' : '');
        if (!recoveryModel) throw primaryError;
        try {
          result = await this.#openRouter(prompt, system, maxTokens, role, recoveryModel);
        } catch (recoveryError) {
          throw new Error(`${failure} | free fallback ${recoveryModel}: ${safeText(recoveryError)}`);
        }
        this.lastError = `free model fallback: ${failure}`;
      }
      this.lastProvider = result.provider;
      this.lastModel = result.model;
      this.lastRequestedModel = result.requestedModel;
      this.lastRole = role;
      this.lastLatencyMs = Date.now() - started;
      if (!this.lastError.startsWith('free model fallback:')) this.lastError = '';
      return result;
    } catch (error) {
      this.lastRole = role;
      this.lastLatencyMs = Date.now() - started;
      this.lastError = safeText(error);
      throw error;
    }
  }

  snapshot() {
    const date = todayUtc();
    const usage = this.memoryUsage.get(`openrouter:${date}`) || { requests: 0, failures: 0 };
    const configured = this.#configuredModels();
    return {
      enabled: this.enabled,
      zero_cost_mode: Boolean(config.zeroCostMode),
      provider: 'openrouter-free',
      endpoint_verified: isTrustedOpenRouterEndpoint(config.openRouterBaseUrl),
      api_key_configured: Boolean(config.openRouterApiKey),
      configured_models: configured,
      rejected_models: config.openRouterFreeModels.filter((item) => !isGuaranteedFreeOpenRouterModel(item)),
      auto_discovery: Boolean(config.freeFederationDiscoverModels),
      verified_catalog_models: this.catalog.length,
      catalog_updated_at: this.catalogUpdatedAt ? new Date(this.catalogUpdatedAt).toISOString() : '',
      catalog_error: this.catalogError,
      max_requests_per_day: config.freeFederationMaxRequestsPerDay,
      process_requests_today: Number(usage.requests || 0),
      process_failures_today: Number(usage.failures || 0),
      chat_reserved_requests: Math.min(config.freeFederationChatReserve, config.freeFederationMaxRequestsPerDay),
      background_request_limit: Math.max(0, config.freeFederationMaxRequestsPerDay - config.freeFederationChatReserve),
      cooldown_until: this.rateLimitUntilMs > Date.now() ? new Date(this.rateLimitUntilMs).toISOString() : null,
      last_rate_limit_at: this.lastRateLimitAt,
      last_role: this.lastRole,
      last_role_is_complex: COMPLEX_ROLES.has(this.lastRole),
      last_provider: this.lastProvider,
      last_model: this.lastModel,
      last_requested_model: this.lastRequestedModel,
      last_latency_ms: this.lastLatencyMs,
      last_error: this.lastError,
      quarantined: [...this.quarantined],
      financial_guard: 'live-zero-price-proof+intrinsically-free-router',
    };
  }
}
