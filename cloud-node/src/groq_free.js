import { config } from './config.js';

// Groq's free plan is non-billing and rate-limited. This adapter is intentionally
// disabled until the deployment owner explicitly confirms that their key belongs
// to the Free plan. It cannot silently use a paid Groq organization.
const SAFE_MODELS = new Set(['openai/gpt-oss-20b', 'openai/gpt-oss-120b']);
const CHAT_ROLES = new Set(['french', 'conversation']);
const BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

export class GroqFreeFaculty {
  constructor({
    apiKey = config.groqApiKey,
    freePlanConfirmed = config.groqFreePlanConfirmed,
    zeroCostMode = config.zeroCostMode,
    model = config.groqFreeModel,
    maxRequestsPerDay = config.groqFreeMaxRequestsPerDay,
    fetcher = fetch,
    clock = () => Date.now(),
  } = {}) {
    this.apiKey = String(apiKey || '').trim();
    this.freePlanConfirmed = Boolean(freePlanConfirmed);
    this.zeroCostMode = Boolean(zeroCostMode);
    this.model = String(model || 'openai/gpt-oss-20b').trim();
    this.maxRequestsPerDay = Math.max(1, Math.min(1000, Number(maxRequestsPerDay) || 100));
    this.fetcher = fetcher;
    this.clock = clock;
    this.usedDay = '';
    this.usedToday = 0;
    this.lastErrorCode = '';
    this.lastBackend = '';
    this.lastSuccessAt = '';
    this.lastLatencyMs = 0;
    this.cooldownUntil = 0;
  }

  get enabled() {
    return this.zeroCostMode && this.freePlanConfirmed &&
      Boolean(this.apiKey) && SAFE_MODELS.has(this.model);
  }

  rollover() {
    const day = new Date(this.clock()).toISOString().slice(0, 10);
    if (day !== this.usedDay) {
      this.usedDay = day;
      this.usedToday = 0;
    }
  }

  snapshot() {
    this.rollover();
    return {
      enabled: this.enabled,
      api_key_configured: Boolean(this.apiKey),
      free_plan_confirmed: this.freePlanConfirmed,
      zero_cost_mode: this.zeroCostMode,
      model_allowed: SAFE_MODELS.has(this.model),
      model: SAFE_MODELS.has(this.model) ? this.model : 'rejected-model',
      max_requests_per_day: this.maxRequestsPerDay,
      process_requests_today: this.usedToday,
      last_error_code: this.lastErrorCode,
      last_success_at: this.lastSuccessAt,
      last_latency_ms: this.lastLatencyMs,
      cooldown_until: this.cooldownUntil > this.clock()
        ? new Date(this.cooldownUntil).toISOString() : null,
      provider: 'groq-free-plan',
      scope: 'language-only',
    };
  }

  async generate(prompt, system, maxTokens = 650, taskRole = 'french') {
    if (!this.enabled) return null;
    if (!CHAT_ROLES.has(String(taskRole))) return null;
    this.rollover();
    if (this.usedToday >= this.maxRequestsPerDay) {
      this.lastErrorCode = 'groq-free-local-budget-exhausted';
      throw new Error(this.lastErrorCode);
    }
    if (this.cooldownUntil > this.clock()) {
      this.lastErrorCode = 'groq-free-rate-limited';
      throw new Error(this.lastErrorCode);
    }
    // Reserve before awaiting the network: concurrent requests consume the
    // same in-process limit. The Groq service enforces its own account limits.
    this.usedToday += 1;
    this.lastErrorCode = '';
    const started = this.clock();
    let response;
    try {
      response = await this.fetcher(BASE_URL, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: String(system || '').slice(0, 9000) },
            { role: 'user', content: String(prompt || '').slice(0, 18000) },
          ],
          stream: false,
          temperature: 0.7,
          max_tokens: Math.max(96, Math.min(1200, Number(maxTokens) || 650)),
          // Do not request reasoning output; the speech layer never exposes it.
          reasoning_effort: 'low',
        }),
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) {
        const status = Number(response.status) || 0;
        if (status === 429) {
          const rawDelay = String(response.headers?.get?.('retry-after') || '');
          const seconds = /^\d+$/.test(rawDelay) ? Number(rawDelay) : 60;
          this.cooldownUntil = this.clock() + Math.min(3600, Math.max(15, seconds)) * 1000;
        }
        this.lastErrorCode = status === 401 || status === 403
          ? 'groq-free-auth-rejected'
          : status === 429 ? 'groq-free-rate-limited'
          : status >= 500 ? 'groq-free-provider-unavailable'
          : 'groq-free-http-error';
        throw new Error(this.lastErrorCode);
      }
      const payload = await response.json();
      const declaredCost = payload?.usage?.cost;
      if (declaredCost != null && Number(declaredCost) > 0) {
        this.freePlanConfirmed = false;
        this.lastErrorCode = 'groq-zero-cost-violation';
        throw new Error(this.lastErrorCode);
      }
      const answer = String(payload?.choices?.[0]?.message?.content || '').trim();
      if (!answer) {
        this.lastErrorCode = 'groq-free-empty-output';
        throw new Error(this.lastErrorCode);
      }
      this.lastErrorCode = '';
      this.lastBackend = 'groq-free';
      this.lastSuccessAt = new Date(this.clock()).toISOString();
      this.lastLatencyMs = Math.max(0, this.clock() - started);
      return { answer, provider: 'groq-free', model: this.model };
    } catch (error) {
      // Do not persist provider responses: they may include credentials,
      // prompts, account data or unsafe instructions.
      if (!this.lastErrorCode) {
        this.lastErrorCode = error?.name === 'TimeoutError' || error?.name === 'AbortError'
          ? 'groq-free-timeout' : 'groq-free-network-error';
      }
      throw new Error(this.lastErrorCode);
    }
  }
}
