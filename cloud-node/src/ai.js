import { config } from './config.js';

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
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
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
  }

  get provider() {
    if (this.bridge?.enabled && this.bridge?.preferLocalAi) return 'quantic-studio-local-preferred';
    if (config.aiMode === 'bridge') return 'quantic-studio-local';
    return config.aiMode === 'gemini' ? 'google-gemini' : 'openai-compatible';
  }

  get enabled() {
    if (this.bridge?.enabled) return true;
    if (config.aiMode === 'off' || config.aiMode === 'bridge') return false;
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
      last_backend: this.lastBackend,
      last_error: this.lastError,
      last_latency_ms: this.lastLatencyMs,
    };
  }

  async #generateGemini(prompt, system, maxTokens) {
    const model = geminiModel();
    const baseUrl = geminiBaseUrl();
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
      throw new Error(`Gemini HTTP ${response.status}: ${text.slice(0, 500)}`);
    }
    const body = text ? JSON.parse(text) : {};
    return extractGeminiText(body);
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
          this.lastBackend = 'quantic-studio-local';
          this.lastError = '';
          this.lastLatencyMs = Date.now() - started;
          return answer;
        } catch (error) {
          localError = error;
          if (config.aiMode === 'bridge') throw error;
        }
      } else if (config.aiMode === 'bridge') {
        throw new Error('Quantic Studio local hors ligne');
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
