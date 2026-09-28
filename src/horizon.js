import { config } from './config.js';
import { one, query } from './db.js';
import { validateHorizonSignal } from './policy.js';

const EXPECTED_BRIDGE = 'horizon-aura-bridge-v1';
const MAX_SEEN = 5000;
const now = () => new Date().toISOString();

export class HorizonBridge {
  constructor(onSignal) {
    this.onSignal = onSignal;
    this.started = false;
    this.timer = null;
    this.lastSyncAt = '';
    this.lastSuccessAt = '';
    this.lastError = '';
    this.lastFeed = {};
    this.lastNewSignals = 0;
    this.totalDispatched = 0;
  }

  get enabled() {
    return config.horizonEnabled && Boolean(config.horizonBaseUrl);
  }

  headers() {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'AURA-HORIZON-Bridge-Node/1' };
    if (config.horizonApiKey) headers['X-API-Key'] = config.horizonApiKey;
    return headers;
  }

  async request(method, path, { params, body } = {}) {
    if (!this.enabled) throw new Error('Le pont HORIZON n’est pas configuré');
    const url = new URL(`${config.horizonBaseUrl}${path}`);
    for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, String(value));
    const response = await fetch(url, {
      method,
      headers: this.headers(),
      body: body == null ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(config.horizonRequestTimeoutMs),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HORIZON HTTP ${response.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  }

  async createUser() {
    return this.request('PUT', `/v1/horizon/context/users/${encodeURIComponent(config.horizonExternalId)}`, {
      body: {
        external_id: config.horizonExternalId,
        country: config.horizonCountry,
        currency: config.horizonCurrency,
        timezone: config.horizonTimezone,
        preferences: { created_by: 'aura-horizon-bridge-node' },
      },
    });
  }

  async start() {
    this.started = true;
    if (!this.enabled) return;
    try { await this.syncOnce(); } catch (error) { this.lastError = String(error?.message || error).slice(0, 500); }
    this.timer = setInterval(() => {
      this.syncOnce().catch((error) => { this.lastError = String(error?.message || error).slice(0, 500); });
    }, config.horizonPollSeconds * 1000);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
  }

  async seen(signalId) {
    return Boolean(await one('SELECT signal_id FROM horizon_bridge_seen WHERE signal_id=? LIMIT 1', [signalId]));
  }

  async markSeen(signal) {
    await query(
      'INSERT IGNORE INTO horizon_bridge_seen(signal_id,entity_key,aura_event,observed_at,first_seen_at) VALUES(?,?,?,?,?)',
      [String(signal.signal_id), String(signal.entity_key || ''), String(signal.aura_event), String(signal.observed_at || ''), now()],
    );
  }

  async pruneSeen() {
    const row = await one('SELECT COUNT(*) AS total FROM horizon_bridge_seen');
    const extra = Math.max(0, Number(row?.total || 0) - MAX_SEEN);
    if (extra > 0) await query(`DELETE FROM horizon_bridge_seen ORDER BY first_seen_at ASC LIMIT ${Math.min(extra, 1000)}`);
  }

  async ingestFeed(feed) {
    const critical = feed?.critical_semantics || {};
    if (critical.scores_are_not_probabilities !== true) throw new Error('Le contrat HORIZON ne garantit pas la séparation score/probabilité');
    if (critical.aura_must_preserve_epistemic_status !== true) throw new Error('Le contrat HORIZON ne garantit pas le statut épistémique');
    let dispatched = 0;
    let duplicates = 0;
    for (const raw of Array.isArray(feed?.signals) ? feed.signals : []) {
      const signal = { ...raw, payload: { ...(raw?.payload || {}) } };
      validateHorizonSignal(signal);
      if (await this.seen(String(signal.signal_id))) { duplicates += 1; continue; }
      const payload = {
        ...signal.payload,
        horizon_signal_id: String(signal.signal_id),
        horizon_entity_key: String(signal.entity_key || ''),
        horizon_observed_at: String(signal.observed_at || ''),
        horizon_bridge: String(feed.bridge || EXPECTED_BRIDGE),
      };
      await this.onSignal(String(signal.aura_event), payload, 'horizon');
      await this.markSeen(signal);
      dispatched += 1;
      this.totalDispatched += 1;
    }
    await this.pruneSeen();
    return { ok: true, new_signals: dispatched, duplicates, total_feed_signals: Array.isArray(feed?.signals) ? feed.signals.length : 0 };
  }

  async syncOnce() {
    this.lastSyncAt = now();
    const feed = await this.request('GET', '/v1/horizon/aura/feed', {
      params: {
        external_id: config.horizonExternalId,
        event_limit: config.horizonEventLimit,
        candidate_limit: config.horizonCandidateLimit,
        forecast_limit: config.horizonForecastLimit,
      },
    });
    if (feed.bridge !== EXPECTED_BRIDGE) throw new Error(`Version du pont HORIZON incompatible: ${String(feed.bridge)}`);
    if (feed.user_found === false) { await this.createUser(); feed.user_found = true; }
    const result = await this.ingestFeed(feed);
    this.lastFeed = feed;
    this.lastNewSignals = result.new_signals;
    this.lastSuccessAt = now();
    this.lastError = '';
    return result;
  }

  async pushFact(input) {
    const body = {
      domain: String(input.domain || ''),
      key: String(input.key || ''),
      value: input.value && typeof input.value === 'object' ? input.value : {},
      source: 'aura',
      provenance: { bridge: EXPECTED_BRIDGE, origin: 'aura_cloud_context' },
      confidence: Math.max(0, Math.min(Number(input.confidence ?? 1), 1)),
      sensitivity: String(input.sensitivity || 'personal'),
      replace_current: input.replace_current !== false,
    };
    if (input.expires_at) body.expires_at = String(input.expires_at);
    try {
      return await this.request('POST', `/v1/horizon/context/users/${encodeURIComponent(config.horizonExternalId)}/state/facts`, { body });
    } catch (error) {
      if (!String(error?.message || error).includes('HTTP 404')) throw error;
      await this.createUser();
      return this.request('POST', `/v1/horizon/context/users/${encodeURIComponent(config.horizonExternalId)}/state/facts`, { body });
    }
  }

  async pushIntent(input) {
    const body = {
      kind: String(input.kind || ''),
      statement: String(input.statement || ''),
      target: input.target && typeof input.target === 'object' ? input.target : {},
      priority: Math.max(0, Math.min(Number(input.priority ?? 0.5), 1)),
    };
    try {
      return await this.request('POST', `/v1/horizon/context/users/${encodeURIComponent(config.horizonExternalId)}/intents`, { body });
    } catch (error) {
      if (!String(error?.message || error).includes('HTTP 404')) throw error;
      await this.createUser();
      return this.request('POST', `/v1/horizon/context/users/${encodeURIComponent(config.horizonExternalId)}/intents`, { body });
    }
  }

  contextForAi() {
    const rows = (Array.isArray(this.lastFeed?.signals) ? this.lastFeed.signals : []).slice(-config.horizonAiContextSignals);
    const lines = [];
    for (const signal of rows) {
      const payload = signal?.payload || {};
      let label = '';
      let statement = '';
      if (payload.kind === 'confirmed_event') { label = 'ÉVÉNEMENT HORIZON'; statement = String(payload.title || ''); }
      else if (payload.kind === 'emerging_hypothesis') { label = 'HYPOTHÈSE NON CONFIRMÉE'; statement = String(payload.title || ''); }
      else if (payload.kind === 'personal_forecast') { label = 'PRÉVISION PERSONNELLE'; statement = String(payload.predicted_outcome || payload.event_title || ''); }
      if (statement) lines.push(`[${label}] ${String(payload.domain_label || payload.domain || '')}: ${statement}`.slice(0, 600));
    }
    if (!lines.length) return '';
    return `Contexte HORIZON récent. Une HYPOTHÈSE NON CONFIRMÉE n’est jamais un fait et un score HORIZON n’est pas une probabilité calibrée.\n${lines.join('\n')}`;
  }

  status() {
    return {
      enabled: this.enabled,
      started: this.started,
      bridge: EXPECTED_BRIDGE,
      base_url: config.horizonBaseUrl,
      external_id: config.horizonExternalId,
      poll_seconds: config.horizonPollSeconds,
      last_sync_at: this.lastSyncAt,
      last_success_at: this.lastSuccessAt,
      last_error: this.lastError,
      last_new_signals: this.lastNewSignals,
      total_dispatched: this.totalDispatched,
      feed_summary: this.lastFeed?.summary || {},
      epistemic_guard: true,
    };
  }
}
