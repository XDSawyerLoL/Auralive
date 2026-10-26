/* AURA Groq *verbalization only* — strictly opt-in, explicitly free-plan gated.
 * No tools, no reasoning/actions delegated, no hidden paid fallback.
 * Requests remain in memory with a per-day process cap. Hostinger runs one
 * Node process per web app, but restarts reset this in-process safety counter.
 */
const API = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_FREE_SPEECH_MODELS = Object.freeze([
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
]);
const cap = (num, fallback, min, max) => {
  const n = Number(num);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback;
};
const yes = val => /^(1|true|yes|oui|on)$/i.test(String(val ?? '').trim());
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const freshDate = () => new Date().toISOString().slice(0, 10);

export class GroqFreeSpeech {
  constructor({ env = process.env, request = fetch, date = freshDate } = {}) {
    this.env = env;
    this.request = request;
    this.date = date;
    this.day = '';
    this.requestsToday = 0;
    this.lastError = '';
    this.lastSuccessAt = '';
    this.lastModel = '';
    this.lastLatencyMs = 0;
    this.cooldownUntil = 0;
  }

  get key() { return String(this.env.AURA_GROQ_API_KEY || this.env.GROQ_API_KEY || ''); }
  get model() {
    const name = String(this.env.AURA_GROQ_SPEECH_MODEL || 'qwen/qwen3.8-27b');
    return GROQ_FREE_SPEECH_MODELS.includes(name) ? name : '';
  }
  get enabled() {
    return yes(this.env.AURA_GROQ_SPEECH_FREE_ENABLED)
      && yes(this.env.AURA_GROQ_FREE_PLAN_CONFIRMED)
      && Boolean(this.key && this.model);
  }
  get limit() { return cap(this.env.AURA_GROQ_SPEECH_MAX_PER_DAY, 20, 1, 30); }
  get timeoutMs() { return cap(this.env.AURA_GROQ_SPEECH_TIMEOUT_MS, 12000, 3000, 25000); }

  snapshot() {
    return {
      enabled: this.enabled, key_configured: Boolean(this.key),
      free_plan_confirmed: yes(this.env.AURA_GROQ_FREE_PLAN_CONFIRMED),
      requested_model_allowed: Boolean(this.model),
      model: this.model, endpoint: 'api.groq.com', requests_today: this.requestsToday,
      limit_per_process_day: this.limit, last_error: this.lastError,
      last_success_at: this.lastSuccessAt, last_latency_ms: this.lastLatencyMs,
      role: 'expression-only', no_paid_fallback: true,
    };
  }

  async generate(prompt, system, maxTokens = 400) {
    if (!this.enabled) return '';
    const today = this.date();
    if (today !== this.day) {
      this.day = today;
      this.requestsToday = 0;
    }
    if (this.requestsToday >= this.limit) {
      this.lastError = 'groq-free-daily-budget-reached';
      return '';
    }
    if (Date.now() < this.cooldownUntil) {
      this.lastError = 'groq-free-cooldown';
      return '';
    }
    // This is a strict local limit, not a guarantee about remote billing
    // permissions. The user must confirm an actual non-billable Free plan.
    this.requestsToday += 1;
    const start = Date.now();
    try {
      const response = await this.request(API, {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + this.key,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: String(system || '').slice(0, 5000) },
            { role: 'user', content: String(prompt || '').slice(0, 15000) },
          ],
          stream: false, temperature: 0.5,
          max_completion_tokens: cap(maxTokens, 400, 120, 600),
          // Never use Groq's remote tools, MCP, or automatic actions.
          tool_choice: 'none',
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        const status = Number(response.status) || 0;
        this.lastError = 'groq-free-http-' + status;
        if (status === 429) this.cooldownUntil = Date.now() + 60_000;
        return '';
      }
      const body = await response.json();
      const first = body?.choices?.[0]?.message;
      // No tool calls or developer thought process may be returned as speech.
      if (first?.tool_calls?.length) {
        this.lastError = 'groq-unexpected-tool-call';
        return '';
      }
      let answer = clean(first?.content || '');
      answer = answer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (/<think>|<\/think>|(?:^|\s)analysis\s*:/i.test(answer) || !answer) {
        this.lastError = 'groq-empty-or-reasoning-response';
        return '';
      }
      this.lastError = '';
      this.lastSuccessAt = new Date().toISOString();
      this.lastModel = this.model;
      this.lastLatencyMs = Date.now() - start;
      return answer;
    } catch (error) {
      this.lastError = error?.name === 'TimeoutError'
        ? 'groq-free-timeout' : 'groq-free-network-or-json-error';
      return '';
    }
  }
}

export const groqFreeSpeech = new GroqFreeSpeech();
