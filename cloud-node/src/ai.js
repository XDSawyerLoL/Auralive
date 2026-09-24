import { config } from './config.js';

function completionUrl() {
  if (config.aiBaseUrl.endsWith('/v1')) return `${config.aiBaseUrl}/chat/completions`;
  return `${config.aiBaseUrl}/v1/chat/completions`;
}

export class AiClient {
  get enabled() {
    return config.aiMode !== 'off' && Boolean(config.aiBaseUrl && config.aiModel);
  }

  async generate(prompt, system, maxTokens = 700) {
    if (!this.enabled) return '';
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
}
