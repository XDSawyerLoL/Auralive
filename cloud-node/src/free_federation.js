import { config } from './config.js';
import { databaseConfigured, one, query } from './db.js';

const COMPLEX_ROLES = new Set(['reasoning', 'code', 'research', 'critic', 'security', 'evolution', 'math']);
const SAFE_OPENROUTER_MODEL = /^(?:openrouter\/free|[a-z0-9._-]+\/[a-z0-9._:-]+:free)$/i;

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

function clamp01(value, fallback = 0.5) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function isGuaranteedFreeOpenRouterModel(model) {
  return SAFE_OPENROUTER_MODEL.test(String(model || '').trim());
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
  }

  get enabled() {
    return Boolean(
      config.zeroCostMode
      && config.freeFederationEnabled
      && config.openRouterApiKey
      && this.#safeOpenRouterModels().length,
    );
  }

  #safeOpenRouterModels() {
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
          requests: Number(row.requests || 0),
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

  async #reserve(provider) {
    const usage = await this.#usage(provider);
    if (usage.requests >= config.freeFederationMaxRequestsPerDay) {
      throw new Error(
        `${provider} free daily budget exhausted (${usage.requests}/${config.freeFederationMaxRequestsPerDay})`,
      );
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
      // The provider itself still has a hard free-model/rate-limit boundary.
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
         ) VALUES(?,?,?,1,?,?,?, ?, ?, ?)
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

  async #openRouter(prompt, system, maxTokens, role, requestedModel) {
    if (this.quarantined.has('openrouter')) throw new Error('OpenRouter free provider quarantined');
    if (!isGuaranteedFreeOpenRouterModel(requestedModel)) {
      throw new Error('Blocked non-guaranteed-free OpenRouter model');
    }

    await this.#reserve('openrouter');
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

      response = await fetch(`${config.openRouterBaseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: requestedModel,
          messages: [
            { role: 'system', content: String(system || '') },
            { role: 'user', content: String(prompt || '') },
          ],
          temperature: Number.isFinite(config.aiTemperature) ? config.aiTemperature : 0.65,
          max_tokens: Math.max(64, Math.min(Number(maxTokens) || 700, 4000)),
          stream: false,
          usage: { include: true },
        }),
        signal: AbortSignal.timeout(config.freeFederationTimeoutMs),
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`OpenRouter free HTTP ${response.status}: ${raw.slice(0, 500)}`);
      }
      body = raw ? JSON.parse(raw) : {};
      const cost = Number(body?.usage?.cost ?? body?.usage?.cost_details?.upstream_inference_cost ?? 0);
      if (Number.isFinite(cost) && cost > 0) {
        this.quarantined.add('openrouter');
        throw new Error(`ZERO_COST_INVARIANT_VIOLATION: OpenRouter reported cost ${cost}`);
      }

      const answer = String(body?.choices?.[0]?.message?.content || '').trim();
      if (!answer) throw new Error('OpenRouter free response empty');
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

  async #preferredRequestedModel(role) {
    const models = this.#safeOpenRouterModels();
    if (!models.length) return '';
    if (models.length === 1) return models[0];

    // Learned technical reliability can choose among explicitly-free variants.
    // openrouter/free remains the safe catch-all when no useful history exists.
    try {
      if (!databaseConfigured()) throw new Error('ledger-disabled');
      const placeholders = models.map(() => '?').join(',');
      const rows = await query(
        `SELECT model,calls,successes,failures,ema_latency_ms,ema_quality
         FROM aura_free_model_scorecards
         WHERE provider='openrouter' AND role=? AND model IN (${placeholders})
         ORDER BY
           (successes+1)/(calls+2) DESC,
           COALESCE(ema_quality,0.5) DESC,
           CASE WHEN ema_latency_ms<=0 THEN 999999 ELSE ema_latency_ms END ASC
         LIMIT 1`,
        [roleName(role), ...models],
      );
      const learned = String(rows?.[0]?.model || '');
      if (learned && models.includes(learned)) return learned;
    } catch {
      // Fall back to the first intrinsically-free model.
    }
    return models[0];
  }

  async generate(prompt, system, maxTokens = 700, taskRole = 'auto') {
    if (!this.enabled) return null;
    const role = roleName(taskRole);
    const requestedModel = await this.#preferredRequestedModel(role);
    const started = Date.now();
    try {
      const result = await this.#openRouter(prompt, system, maxTokens, role, requestedModel);
      this.lastProvider = result.provider;
      this.lastModel = result.model;
      this.lastRequestedModel = result.requestedModel;
      this.lastRole = role;
      this.lastLatencyMs = result.latencyMs;
      this.lastError = '';
      return result;
    } catch (error) {
      this.lastLatencyMs = Date.now() - started;
      this.lastError = safeText(error);
      throw error;
    }
  }

  snapshot() {
    const date = todayUtc();
    const usage = this.memoryUsage.get(`openrouter:${date}`) || { requests: 0, failures: 0 };
    const safeModels = this.#safeOpenRouterModels();
    return {
      enabled: this.enabled,
      zero_cost_mode: Boolean(config.zeroCostMode),
      provider: 'openrouter-free',
      api_key_configured: Boolean(config.openRouterApiKey),
      configured_models: safeModels,
      rejected_models: config.openRouterFreeModels.filter((item) => !isGuaranteedFreeOpenRouterModel(item)),
      max_requests_per_day: config.freeFederationMaxRequestsPerDay,
      process_requests_today: Number(usage.requests || 0),
      process_failures_today: Number(usage.failures || 0),
      last_role: this.lastRole,
      last_role_is_complex: COMPLEX_ROLES.has(this.lastRole),
      last_provider: this.lastProvider,
      last_model: this.lastModel,
      last_requested_model: this.lastRequestedModel,
      last_latency_ms: this.lastLatencyMs,
      last_error: this.lastError,
      quarantined: [...this.quarantined],
      financial_guard: 'intrinsically-free-models-only',
    };
  }
}
