import { config } from './config.js';

// Only a user-managed local daemon or explicitly authorized HTTPS inference
// endpoint is accepted. This is not an arbitrary third-party model API router.
export function isSelfHostedEndpointAllowed(value, confirmed = false) {
  try {
    const url = new URL(String(value || ''));
    if (url.username || url.password || url.search || url.hash) return false;
    if (url.pathname.replace(/\/$/, '') !== '/v1') return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const loopback = ['localhost', '127.0.0.1', '::1'].includes(host);
    if (loopback) return url.protocol === 'http:' || url.protocol === 'https:';
    if (url.protocol !== 'https:' || !confirmed) return false;
    if (!host.includes('.')) return false;
    // Never re-label known external model APIs as "self-hosted" to evade guards.
    if (/(^|\.)(openrouter\.ai|openai\.com|generativelanguage\.googleapis\.com|api\.anthropic\.com|huggingface\.co|groq\.com|together\.xyz)$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function publicError(error) {
  const message = String(error?.message || error || '').replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
  return message.replace(/sk-[\w-]+/g, '[REDACTED]').replace(/\s+/g, ' ').slice(0, 250);
}

export class SelfHostedLanguage {
  constructor() {
    this.lastError = '';
    this.lastModel = '';
    this.lastSuccessAt = '';
    this.lastLatencyMs = 0;
  }

  get enabled() {
    return Boolean(config.zeroCostMode && config.selfHostedLanguageEnabled
      && config.selfHostedLanguageModel
      && isSelfHostedEndpointAllowed(config.selfHostedLanguageBaseUrl, config.selfHostedLanguageConfirmed));
  }

  snapshot() {
    const url = String(config.selfHostedLanguageBaseUrl || '');
    const isLoopback = /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\/v1\/?$/i.test(url);
    return {
      configured: Boolean(url),
      enabled: this.enabled,
      ready: Boolean(this.lastSuccessAt),
      last_success_at: this.lastSuccessAt,
      last_error: this.lastError,
      last_latency_ms: this.lastLatencyMs,
      model: config.selfHostedLanguageModel,
      connection: !url ? 'unconfigured' : (isLoopback ? 'loopback' : 'owner-managed-https'),
      tokens_billed: false,
      external_api_required: false,
      model_loaded_by_aura: false,
    };
  }

  async generate(prompt, system, maxTokens = 600) {
    if (!this.enabled) return null;
    const started = Date.now();
    try {
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
      if (config.selfHostedLanguageApiKey) headers.Authorization = `Bearer ${config.selfHostedLanguageApiKey}`;
      const response = await fetch(`${config.selfHostedLanguageBaseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.selfHostedLanguageModel,
          stream: false,
          messages: [
            { role: 'system', content: String(system || '') },
            { role: 'user', content: String(prompt || '') },
          ],
          max_tokens: Math.max(48, Math.min(Number(maxTokens) || 600, 2000)),
          temperature: Number.isFinite(config.aiTemperature) ? config.aiTemperature : 0.65,
        }),
        signal: AbortSignal.timeout(config.selfHostedLanguageTimeoutMs),
      });
      if (!response.ok) throw new Error(`AURA inference HTTP ${response.status}`);
      const body = await response.json();
      const raw = body?.choices?.[0]?.message?.content;
      const answer = typeof raw === 'string' ? raw.trim()
        : (Array.isArray(raw) ? raw.map((part) => part?.text || '').join(' ').trim() : '');
      if (!answer) throw new Error('AURA inference empty response');
      this.lastError = '';
      this.lastLatencyMs = Date.now() - started;
      this.lastModel = String(body?.model || config.selfHostedLanguageModel).slice(0, 120);
      this.lastSuccessAt = new Date().toISOString();
      return {
        answer, provider: 'aura-self-hosted', model: this.lastModel, latencyMs: this.lastLatencyMs,
        costMicrounits: 0,
      };
    } catch (error) {
      this.lastError = publicError(error);
      this.lastLatencyMs = Date.now() - started;
      throw new Error(this.lastError);
    }
  }
}
