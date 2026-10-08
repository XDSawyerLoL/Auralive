import { config } from './config.js';
import { ZeroCostFederation } from './free_federation.js';
import { SelfHostedLanguage } from './self_hosted_language.js';
import { freeTierModelAllowed, markConfirmedFreeTier, reserveConfirmedFreeTier } from './gemini_free_tier.js';

function completionUrl() {
  if (config.aiBaseUrl.endsWith('/v1')) return `${config.aiBaseUrl}/chat/completions`;
  return `${config.aiBaseUrl}/v1/chat/completions`;
}

function geminiBaseUrl() {
  const configured = String(config.aiBaseUrl || '').replace(/\/$/, '');
  if (!configured || configured.includes('localhost:11434') || configured.includes('127.0.0.1:11434')) {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }
  return configured;
}

function geminiModel() {
  const configured = String(config.aiModel || '').trim().replace(/^models\//, '');
  return configured.startsWith('gemini-') ? configured : 'gemini-3.5-flash-lite';
}

function safeError(error) {
  return String(error?.message || error || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk-|AIza)[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{16,}\b/g, '[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
}

function isLocalAiEndpoint(value) {
  try {
    const url = new URL(String(value || ''));
    const host = String(url.hostname || '').toLowerCase();
    return ['localhost', '127.0.0.1', '::1'].includes(host);
  } catch {
    return false;
  }
}

function remoteFallbackBlocked() {
  if (!config.zeroCostMode) return false;
  if (config.aiMode === 'off' || config.aiMode === 'bridge') return false;
  if (config.aiMode === 'gemini') {
    return !(
      config.geminiFreeTierConfirmed
      && freeTierModelAllowed(geminiModel(), 'text')
    );
  }
  return !isLocalAiEndpoint(config.aiBaseUrl);
}

function extractGeminiText(payload) {
  const candidate = payload?.candidates?.[0] || {};
  const parts = candidate?.content?.parts || [];
  const text = parts
    .filter((part) => !part?.thought)
    .map((part) => String(part?.text || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  if (text) return text;

  const finishReason = String(candidate?.finishReason || 'unknown');
  const feedback = payload?.promptFeedback ? JSON.stringify(payload.promptFeedback).slice(0, 240) : '';
  throw new Error(
    `Gemini response empty (finishReason=${finishReason}${feedback ? `, feedback=${feedback}` : ''})`,
  );
}

export class AiClient {
  constructor(bridge = null) {
    this.bridge = bridge;
    this.lastError = '';
    this.lastLatencyMs = 0;
    this.lastBackend = '';
    this.federation = new ZeroCostFederation();
    this.selfHosted = new SelfHostedLanguage();
  }

  get provider() {
    if (this.selfHosted.enabled) return 'aura-self-hosted';
    if (this.bridge?.enabled && this.bridge?.preferLocalAi) {
      return this.federation.enabled
        ? 'aura-runtime-local+zero-cost-federation'
        : 'aura-runtime-local-preferred';
    }
    if (this.federation.enabled) return 'zero-cost-federation';
    if (config.aiMode === 'bridge') return 'aura-runtime-local';
    if (remoteFallbackBlocked()) return 'blocked-zero-cost';
    return config.aiMode === 'gemini' ? 'google-gemini' : 'openai-compatible';
  }

  get enabled() {
    if (this.selfHosted.enabled) return true;
    if (this.bridge?.enabled || this.federation.enabled) return true;
    if (config.aiMode === 'off' || config.aiMode === 'bridge') return false;
    if (remoteFallbackBlocked()) return false;
    if (config.aiMode === 'gemini') {
      return Boolean(config.aiApiKey && geminiBaseUrl() && geminiModel());
    }
    return Boolean(config.aiBaseUrl && config.aiModel);
  }

  diagnostic() {
    return {
      enabled: this.enabled,
      mode: config.aiMode,
      provider: this.provider,
      base_url: config.aiMode === 'gemini' ? geminiBaseUrl() : config.aiBaseUrl,
      model: config.aiMode === 'gemini' ? geminiModel() : config.aiModel,
      api_key_configured: Boolean(config.aiApiKey),
      timeout_ms: config.aiTimeoutMs,
      local_bridge_configured: Boolean(this.bridge?.enabled),
      local_ai_preferred: Boolean(this.bridge?.preferLocalAi),
      zero_cost_mode: Boolean(config.zeroCostMode),
      remote_fallback_blocked: remoteFallbackBlocked(),
      gemini_free_tier_confirmed: Boolean(config.geminiFreeTierConfirmed),
      gemini_free_tier_model_allowed: freeTierModelAllowed(geminiModel(), 'text'),
      gemini_free_tier_daily_cap: Number(config.geminiFreeTierTextMaxPerDay),
      free_federation: this.federation.snapshot(),
      self_hosted_language: this.selfHosted.snapshot(),
      last_backend: this.lastBackend,
      last_error: this.lastError,
      last_latency_ms: this.lastLatencyMs,
    };
  }

  async #generateGemini(prompt, system, maxTokens) {
    const model = geminiModel();
    const baseUrl = geminiBaseUrl();
    const guardedFreeTier = Boolean(
      config.zeroCostMode
      && config.geminiFreeTierConfirmed
      && freeTierModelAllowed(model, 'text')
    );
    if (guardedFreeTier) {
      await reserveConfirmedFreeTier(
        'gemini-free-text',
        config.geminiFreeTierTextMaxPerDay,
      );
    }
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: String(prompt || '') }],
        },
      ],
      generationConfig: {
        temperature: Number.isFinite(config.aiTemperature) ? config.aiTemperature : 0.65,
        maxOutputTokens: Math.max(64, Math.min(Number(maxTokens) || 700, 4000)),
      },
    };
    if (String(system || '').trim()) {
      payload.systemInstruction = {
        parts: [{ text: String(system) }],
      };
    }

    const response = await fetch(
      `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-goog-api-key': config.aiApiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.aiTimeoutMs),
      },
    );

    const text = await response.text();
    if (!response.ok) {
      if (guardedFreeTier) {
        await markConfirmedFreeTier('gemini-free-text', false, `HTTP ${response.status}`);
      }
      throw new Error(`Gemini HTTP ${response.status}: ${text.slice(0, 500)}`);
    }
    const body = text ? JSON.parse(text) : {};
    const answer = extractGeminiText(body);
    if (guardedFreeTier) {
      await markConfirmedFreeTier('gemini-free-text', true, 'ok');
    }
    return answer;
  }

  async #generateOpenAiCompatible(prompt, system, maxTokens) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (config.aiApiKey) headers.Authorization = `Bearer ${config.aiApiKey}`;

    const response = await fetch(completionUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.aiModel,
        messages: [
          { role: 'system', content: String(system || '') },
          { role: 'user', content: String(prompt || '') },
        ],
        temperature: Number.isFinite(config.aiTemperature) ? config.aiTemperature : 0.65,
        max_tokens: Math.max(64, Math.min(Number(maxTokens) || 700, 4000)),
        stream: false,
      }),
      signal: AbortSignal.timeout(config.aiTimeoutMs),
    });

    const text = await response.text();
    if (!response.ok) throw new Error(`AI HTTP ${response.status}: ${text.slice(0, 500)}`);
    const payload = text ? JSON.parse(text) : {};
    return String(payload?.choices?.[0]?.message?.content || payload?.response || '').trim();
  }

  async generate(prompt, system, maxTokens = 700, taskRole = 'auto') {
    if (!this.enabled) return '';

    const started = Date.now();
    let localError = null;
    try {
      const wantsLocal = Boolean(
        this.bridge?.enabled
        && (this.bridge.preferLocalAi || config.aiMode === 'bridge'),
      );
      if (wantsLocal && await this.bridge.workerOnline()) {
        try {
          const answer = await this.bridge.infer(prompt, system, maxTokens, taskRole);
          this.lastBackend = 'aura-runtime-local';
          this.lastError = '';
          this.lastLatencyMs = Date.now() - started;
          return answer;
        } catch (error) {
          localError = error;
        }
      } else if (config.aiMode === 'bridge') {
        localError = new Error('AURA Runtime local hors ligne');
      }

      let selfHostedError = null;
      if (this.selfHosted.enabled) {
        try {
          const result = await this.selfHosted.generate(prompt, system, maxTokens);
          if (result?.answer) {
            this.lastBackend = 'aura-self-hosted:' + result.model;
            this.lastError = '';
            this.lastLatencyMs = Date.now() - started;
            return result.answer;
          }
        } catch (error) {
          selfHostedError = error;
        }
      }

      let federationError = null;
      if (this.federation.enabled && !this.selfHosted.embedded.enabled) {
        try {
          const result = await this.federation.generate(prompt, system, maxTokens, taskRole);
          if (result?.answer) {
            this.lastBackend = `zero-cost:${result.provider}:${result.model}`;
            this.lastError = localError ? `local unavailable: ${safeError(localError)}` : '';
            this.lastLatencyMs = Date.now() - started;
            return result.answer;
          }
        } catch (error) {
          federationError = error;
        }
      }

      if (remoteFallbackBlocked() || config.aiMode === 'off' || config.aiMode === 'bridge') {
        this.lastBackend = selfHostedError ? 'self-hosted-unavailable' : (federationError ? 'zero-cost-federation-unavailable' : 'zero-cost-block');
        this.lastError = [
          localError ? `local unavailable: ${safeError(localError)}` : '',
          selfHostedError ? `self-hosted unavailable: ${safeError(selfHostedError)}` : '',
          federationError ? `free federation unavailable: ${safeError(federationError)}` : '',
        ].filter(Boolean).join(' | ');
        this.lastLatencyMs = Date.now() - started;
        return '';
      }

      let answer = '';
      if (config.aiMode === 'gemini') {
        answer = await this.#generateGemini(prompt, system, maxTokens);
        this.lastBackend = 'google-gemini-fallback';
      } else if (config.aiMode !== 'off') {
        answer = await this.#generateOpenAiCompatible(prompt, system, maxTokens);
        this.lastBackend = 'openai-compatible-fallback';
      } else if (localError) {
        throw localError;
      }
      this.lastError = localError ? `local fallback: ${safeError(localError)}` : '';
      this.lastLatencyMs = Date.now() - started;
      return answer;
    } catch (error) {
      this.lastError = safeError(error);
      this.lastLatencyMs = Date.now() - started;
      throw error;
    }
  }
}
