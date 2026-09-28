import { config } from './config.js';

const FREE_SOURCES = new Set(['local', 'pexels', 'pixabay', 'coverr']);

function text(value, limit = 8000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function trustedEndpoint(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    const loopback = ['localhost', '127.0.0.1', '::1'].includes(host);
    if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) return null;
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function authorization() {
  return config.videoFactoryApiKey
    ? { Authorization: `Bearer ${config.videoFactoryApiKey}` }
    : {};
}

export class VideoFactoryClient {
  static VERSION = 'aura-video-factory-v1';

  get baseUrl() {
    return trustedEndpoint(config.videoFactoryBaseUrl);
  }

  get enabled() {
    if (!config.videoFactoryEnabled || !this.baseUrl) return false;
    if (config.zeroCostMode && !config.videoFactoryZeroCostConfirmed) return false;
    return true;
  }

  diagnostic() {
    return {
      version: VideoFactoryClient.VERSION,
      enabled: this.enabled,
      configured: Boolean(this.baseUrl),
      zero_cost_mode: Boolean(config.zeroCostMode),
      zero_cost_confirmed: Boolean(config.videoFactoryZeroCostConfirmed),
      contract: 'moneyprinterturbo-compatible-v1',
      public_base_url: this.baseUrl ? new URL(this.baseUrl).origin : '',
      free_sources: [...FREE_SOURCES],
      api_key_configured: Boolean(config.videoFactoryApiKey),
    };
  }

  plan(input = {}) {
    const subject = text(input.subject || input.video_subject || input.objective, 500);
    if (!subject) throw new Error('Video Factory exige un sujet');
    const script = text(input.script || input.video_script, 12000);
    const source = String(input.video_source || 'pexels').trim().toLowerCase();
    if (config.zeroCostMode && !FREE_SOURCES.has(source)) {
      throw new Error(`source vidéo non autorisée en mode zéro coût: ${source}`);
    }
    const aspect = ['9:16', '16:9', '1:1'].includes(String(input.video_aspect))
      ? String(input.video_aspect)
      : '9:16';
    return {
      subject,
      script,
      video_source: source,
      video_aspect: aspect,
      video_count: Math.max(1, Math.min(Number(input.video_count || 1), 3)),
      subtitle_enabled: input.subtitle_enabled !== false,
      voice_name: text(input.voice_name || '', 160),
      bgm_type: text(input.bgm_type || 'random', 80),
      bgm_volume: Math.max(0, Math.min(Number(input.bgm_volume ?? 0.18), 1)),
      match_materials_to_script: input.match_materials_to_script !== false,
      origin: 'AURA',
      pipeline: [
        'script-or-user-script',
        'material-keywords',
        'free-or-local-materials',
        'voice',
        'subtitles',
        'music',
        'render',
      ],
    };
  }

  async create(input = {}) {
    if (!this.enabled) {
      throw new Error('Video Factory indisponible ou non confirmé zéro coût');
    }
    const plan = this.plan(input);
    const payload = {
      video_subject: plan.subject,
      video_script: plan.script,
      video_aspect: plan.video_aspect,
      video_source: plan.video_source,
      video_count: plan.video_count,
      subtitle_enabled: plan.subtitle_enabled,
      match_materials_to_script: plan.match_materials_to_script,
      bgm_type: plan.bgm_type,
      bgm_volume: plan.bgm_volume,
    };
    if (plan.voice_name) payload.voice_name = plan.voice_name;

    const response = await fetch(`${this.baseUrl}/api/v1/videos`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...authorization(),
      },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: AbortSignal.timeout(config.videoFactoryTimeoutMs),
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Video Factory HTTP ${response.status}: ${raw.slice(0, 500)}`);
    const body = raw ? JSON.parse(raw) : {};
    const taskId = String(body?.data?.task_id || body?.task_id || '').trim();
    if (!taskId) throw new Error('Video Factory n’a retourné aucun task_id');
    return {
      ok: true,
      task_id: taskId,
      state: 'queued',
      plan,
      metrics: { cost_microunits: 0 },
    };
  }

  async status(taskId) {
    if (!this.enabled) throw new Error('Video Factory indisponible');
    const id = String(taskId || '').trim();
    if (!/^[A-Za-z0-9._-]{6,120}$/.test(id)) throw new Error('task_id vidéo invalide');
    const response = await fetch(`${this.baseUrl}/api/v1/tasks/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...authorization() },
      redirect: 'error',
      signal: AbortSignal.timeout(Math.min(config.videoFactoryTimeoutMs, 30000)),
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Video Factory status HTTP ${response.status}: ${raw.slice(0, 500)}`);
    const body = raw ? JSON.parse(raw) : {};
    return {
      ok: true,
      task_id: id,
      ...(body?.data && typeof body.data === 'object' ? body.data : body),
      metrics: { cost_microunits: 0 },
    };
  }
}

export function isTrustedVideoFactoryEndpoint(value) {
  return Boolean(trustedEndpoint(value));
}
