import { config } from './config.js';

const clean = (value, limit = 8000) =>
  String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);

export function normalizeMoneyPrinterEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) return { configured: false, trusted: false, base_url: '', reason: 'not-configured' };
  try {
    const url = new URL(raw);
    if (url.username || url.password) {
      return { configured: true, trusted: false, base_url: '', reason: 'credentials-in-url-blocked' };
    }
    const loopback = ['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname.toLowerCase());
    if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
      return { configured: true, trusted: false, base_url: '', reason: 'remote-endpoint-must-use-https' };
    }
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return {
      configured: true,
      trusted: true,
      base_url: url.toString().replace(/\/$/, ''),
      reason: '',
    };
  } catch {
    return { configured: true, trusted: false, base_url: '', reason: 'invalid-url' };
  }
}

function aspect(value) {
  const raw = String(value || '9:16').trim();
  return ['9:16','16:9','1:1'].includes(raw) ? raw : '9:16';
}

export class MoneyPrinterSkill {
  static VERSION = 'aura-video-autoproducer-v1';

  constructor() {
    this.lastError = '';
    this.lastTaskId = '';
    this.lastSubmitAt = '';
  }

  get endpoint() {
    return normalizeMoneyPrinterEndpoint(config.videoMoneyPrinterBaseUrl);
  }

  get enabled() {
    const ep = this.endpoint;
    if (!config.videoSkillEnabled || !ep.trusted) return false;
    if (config.zeroCostMode && !config.videoMoneyPrinterZeroCostConfirmed) return false;
    if (!config.videoMoneyPrinterAutoPublishDisabledConfirmed) return false;
    return true;
  }

  plan(input = {}) {
    const subject = clean(input.subject || input.topic || input.objective, 500);
    const script = clean(input.script, 12000);
    if (!subject && !script) throw new Error('video skill exige subject/topic ou script');
    const language = clean(input.language || 'fr', 32);
    const videoAspect = aspect(input.aspect || input.video_aspect);
    const payload = {
      video_subject: subject || clean(script, 180),
      video_script: script,
      video_aspect: videoAspect,
      video_count: Math.max(1, Math.min(Number(input.video_count || 1), 3)),
      video_clip_duration: Math.max(2, Math.min(Number(input.clip_duration || 5), 12)),
      video_language: language,
      video_source: clean(input.video_source || 'local', 40),
      voice_name: clean(input.voice_name || '', 120),
      bgm_type: clean(input.bgm_type || 'random', 40),
      bgm_volume: Math.max(0, Math.min(Number(input.bgm_volume ?? 0.16), 1)),
      subtitle_enabled: input.subtitle_enabled !== false,
      subtitle_position: clean(input.subtitle_position || 'bottom', 40),
      subtitle_display_mode: ['sentence','word_by_word'].includes(input.subtitle_display_mode)
        ? input.subtitle_display_mode
        : 'sentence',
      paragraph_number: Math.max(1, Math.min(Number(input.paragraph_number || 1), 10)),
      match_materials_to_script: input.match_materials_to_script !== false,
    };
    return {
      skill: MoneyPrinterSkill.VERSION,
      origin: 'adapted-from-moneyprinterturbo-workflow',
      license_boundary: 'api-contract-and-workflow-adaptation-no-source-vendoring',
      stages: [
        'brief',
        script ? 'use-script' : 'script',
        'material-keywords',
        'visual-materials',
        'voiceover',
        'subtitles',
        'background-music',
        'edit-and-compose',
        'quality-check',
        'publish-ready',
      ],
      payload,
      execution: {
        configured: this.endpoint.configured,
        trusted_endpoint: this.endpoint.trusted,
        enabled: this.enabled,
        zero_cost_mode: Boolean(config.zeroCostMode),
        zero_cost_confirmed: Boolean(config.videoMoneyPrinterZeroCostConfirmed),
        auto_publish_disabled_confirmed: Boolean(
          config.videoMoneyPrinterAutoPublishDisabledConfirmed
        ),
      },
    };
  }

  headers() {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Task-ID': 'aura-video-skill',
    };
    if (config.videoMoneyPrinterApiKey) headers['X-API-Key'] = config.videoMoneyPrinterApiKey;
    return headers;
  }

  async submit(input = {}) {
    const plan = this.plan(input);
    if (!this.enabled) {
      const reason = this.endpoint.reason
        || (config.zeroCostMode && !config.videoMoneyPrinterZeroCostConfirmed
          ? 'zero-cost-confirmation-required'
          : (!config.videoMoneyPrinterAutoPublishDisabledConfirmed
            ? 'auto-publish-disable-confirmation-required'
            : 'video-backend-disabled'));
      throw new Error(`MoneyPrinter video backend unavailable: ${reason}`);
    }

    const response = await fetch(`${this.endpoint.base_url}/api/v1/videos`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(plan.payload),
      redirect: 'error',
      signal: AbortSignal.timeout(config.videoMoneyPrinterTimeoutMs),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      this.lastError = clean(body?.message || body?.error || `HTTP ${response.status}`, 800);
      throw new Error(`MoneyPrinter video submit failed: ${this.lastError}`);
    }
    const taskId = clean(body?.data?.task_id || body?.task_id, 160);
    if (!taskId) throw new Error('MoneyPrinter response missing task_id');
    this.lastTaskId = taskId;
    this.lastSubmitAt = new Date().toISOString();
    this.lastError = '';
    return {
      ok: true,
      task_id: taskId,
      status_url: `${this.endpoint.base_url}/api/v1/tasks/${encodeURIComponent(taskId)}`,
      provider: 'moneyprinterturbo-compatible',
      cost_microunits: 0,
      plan,
    };
  }

  async status(taskId) {
    if (!this.enabled) throw new Error('MoneyPrinter video backend unavailable');
    const id = clean(taskId, 160);
    if (!id) throw new Error('task_id manquant');
    const response = await fetch(
      `${this.endpoint.base_url}/api/v1/tasks/${encodeURIComponent(id)}`,
      {
        method: 'GET',
        headers: this.headers(),
        redirect: 'error',
        signal: AbortSignal.timeout(Math.min(config.videoMoneyPrinterTimeoutMs, 20000)),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`MoneyPrinter task HTTP ${response.status}`);
    return {
      ok: true,
      task_id: id,
      task: body?.data || body,
      provider: 'moneyprinterturbo-compatible',
      cost_microunits: 0,
    };
  }

  diagnostic() {
    const ep = this.endpoint;
    return {
      version: MoneyPrinterSkill.VERSION,
      enabled: this.enabled,
      configured: ep.configured,
      endpoint_trusted: ep.trusted,
      endpoint_reason: ep.reason,
      zero_cost_mode: Boolean(config.zeroCostMode),
      zero_cost_confirmed: Boolean(config.videoMoneyPrinterZeroCostConfirmed),
      auto_publish_disabled_confirmed: Boolean(
        config.videoMoneyPrinterAutoPublishDisabledConfirmed
      ),
      last_task_id: this.lastTaskId,
      last_submit_at: this.lastSubmitAt,
      last_error: this.lastError,
    };
  }
}
