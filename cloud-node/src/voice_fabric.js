import { config } from './config.js';

const MAX_INPUT_CHARS = 3900;
const DEFAULT_MODEL = 'gemini-3.1-flash-tts-preview';
const DEFAULT_PROFILE_NAME = 'Mairaiy';
const EXPECTED_ENGINE_VOICE = 'aoede';
const EXPECTED_LANGUAGE = 'fr-fr';

function clean(value, limit = 16000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function redact(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b[A-Za-z0-9_-]{28,}\b/g, '[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800);
}

function isLoopbackHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

function normalizedServiceRoot(value) {
  try {
    const url = new URL(String(value || '').trim());
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function isTrustedZeroCostVoiceEndpoint(endpoint) {
  const root = normalizedServiceRoot(endpoint?.service_root || endpoint);
  if (!root) return false;
  const trusted = Array.isArray(config.voiceFabricTrustedZeroCostOrigins)
    ? config.voiceFabricTrustedZeroCostOrigins
    : [];
  return trusted.some((value) => normalizedServiceRoot(value) === root);
}

export function normalizeVoiceStudioEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return {
      configured: false,
      trusted: false,
      remote: false,
      service_root: '',
      api_base: '',
      reason: 'not-configured',
    };
  }
  try {
    const url = new URL(raw);
    if (url.username || url.password) {
      return {
        configured: true,
        trusted: false,
        remote: true,
        service_root: '',
        api_base: '',
        reason: 'credentials-in-url-blocked',
      };
    }
    const loopback = isLoopbackHost(url.hostname);
    const remote = !loopback;
    const trusted = url.protocol === 'https:' || (loopback && url.protocol === 'http:');
    if (!trusted) {
      return {
        configured: true,
        trusted: false,
        remote,
        service_root: '',
        api_base: '',
        reason: 'remote-endpoint-must-use-https',
      };
    }

    let path = url.pathname.replace(/\/+$/, '');
    if (path.endsWith('/v1')) path = path.slice(0, -3);
    url.pathname = path || '/';
    url.search = '';
    url.hash = '';
    const serviceRoot = url.toString().replace(/\/$/, '');
    return {
      configured: true,
      trusted: true,
      remote,
      service_root: serviceRoot,
      api_base: `${serviceRoot}/v1`,
      reason: '',
    };
  } catch {
    return {
      configured: true,
      trusted: false,
      remote: false,
      service_root: '',
      api_base: '',
      reason: 'invalid-url',
    };
  }
}

function splitText(value, maxChars = MAX_INPUT_CHARS) {
  const text = clean(value);
  const limit = Math.max(800, Math.min(Number(maxChars) || MAX_INPUT_CHARS, MAX_INPUT_CHARS));
  if (!text) return [];
  if (text.length <= limit) return [text];

  const sentences = text.match(/[^.!?…]+[.!?…]+[»”"')\]]*|[^.!?…]+$/g) || [text];
  const chunks = [];
  let current = '';

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const rawSentence of sentences) {
    const sentence = String(rawSentence || '').trim();
    if (!sentence) continue;
    if (sentence.length <= limit) {
      if (!current) current = sentence;
      else if ((current + ' ' + sentence).length <= limit) current += ' ' + sentence;
      else {
        pushCurrent();
        current = sentence;
      }
      continue;
    }

    pushCurrent();
    const words = sentence.split(/\s+/);
    let part = '';
    for (const word of words) {
      if (!part) part = word;
      else if ((part + ' ' + word).length <= limit) part += ' ' + word;
      else {
        chunks.push(part);
        part = word;
      }
    }
    if (part) chunks.push(part);
  }

  pushCurrent();
  return chunks.filter(Boolean);
}

function timeoutSignal(ms) {
  return AbortSignal.timeout(Math.max(1000, Number(ms || 60000)));
}

function authHeaders(apiKey, json = false) {
  const headers = {
    Accept: json ? 'application/json' : 'audio/wav',
  };
  if (json) headers['Content-Type'] = 'application/json';
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

async function responseError(response, fallback = 'VoiceStudio request failed') {
  let detail = '';
  try {
    const body = await response.text();
    if (body) {
      try {
        const parsed = JSON.parse(body);
        detail = parsed?.error?.message || parsed?.detail || parsed?.error || body;
      } catch {
        detail = body;
      }
    }
  } catch {}
  return new Error(`${fallback}: HTTP ${response.status}${detail ? ` · ${redact(detail)}` : ''}`);
}

export class VoiceStudioProvider {
  constructor() {
    this.lastError = '';
    this.lastLatencyMs = 0;
    this.lastSuccessAt = '';
    this.lastVoiceId = '';
    this.lastModel = '';
    this.lastDiscoveryAt = 0;
    this.lastDiscovery = null;
    this.profileCache = { id: '', checkedAt: 0 };
  }

  get endpoint() {
    return normalizeVoiceStudioEndpoint(config.voiceFabricBaseUrl);
  }

  get zeroCostTrusted() {
    return isTrustedZeroCostVoiceEndpoint(this.endpoint);
  }

  get enabled() {
    const endpoint = this.endpoint;
    if (!config.voiceFabricEnabled || !endpoint.trusted) return false;
    // The exact Quantic Mairaiy endpoint is a bounded, public, self-hosted route
    // and therefore does not need a bearer key. Every other remote endpoint does.
    if (endpoint.remote && !config.voiceFabricApiKey && !this.zeroCostTrusted) return false;
    // In zero-cost mode an operator confirmation remains mandatory for arbitrary
    // providers. The exact allowlisted Quantic endpoint is intrinsically non-billable.
    if (config.zeroCostMode && !config.voiceFabricZeroCostConfirmed && !this.zeroCostTrusted) return false;
    return true;
  }

  async discover({ force = false } = {}) {
    const endpoint = this.endpoint;
    if (!this.enabled) {
      return {
        ok: false,
        reason: endpoint.reason || (config.zeroCostMode && !config.voiceFabricZeroCostConfirmed
          ? 'zero-cost-confirmation-required'
          : 'provider-disabled'),
      };
    }
    const ttlMs = Math.max(15_000, config.voiceFabricDiscoveryTtlSeconds * 1000);
    if (!force && this.lastDiscovery && Date.now() - this.lastDiscoveryAt < ttlMs) {
      return this.lastDiscovery;
    }

    const started = Date.now();
    try {
      const response = await fetch(`${endpoint.service_root}/.well-known/voicestudio-speech`, {
        method: 'GET',
        headers: authHeaders(config.voiceFabricApiKey, false),
        redirect: 'error',
        signal: timeoutSignal(Math.min(config.voiceFabricTimeoutMs, 15_000)),
      });
      if (!response.ok) throw await responseError(response, 'VoiceStudio discovery failed');
      const data = await response.json();
      this.lastDiscoveryAt = Date.now();
      this.lastDiscovery = {
        ok: true,
        provider: 'voicestudio',
        api_base: endpoint.api_base,
        capabilities: data,
        latency_ms: Date.now() - started,
      };
      return this.lastDiscovery;
    } catch (error) {
      this.lastDiscoveryAt = Date.now();
      this.lastDiscovery = {
        ok: false,
        provider: 'voicestudio',
        reason: redact(error?.message || error),
        latency_ms: Date.now() - started,
      };
      return this.lastDiscovery;
    }
  }

  async voices() {
    const endpoint = this.endpoint;
    if (!this.enabled) return [];
    const response = await fetch(`${endpoint.api_base}/audio/voices`, {
      method: 'GET',
      headers: authHeaders(config.voiceFabricApiKey, true),
      redirect: 'error',
      signal: timeoutSignal(Math.min(config.voiceFabricTimeoutMs, 20_000)),
    });
    if (!response.ok) throw await responseError(response, 'VoiceStudio voice list failed');
    const data = await response.json();
    return Array.isArray(data?.voices) ? data.voices : [];
  }

  async resolveMairaiyProfile() {
    const now = Date.now();
    if (this.profileCache.id && now - this.profileCache.checkedAt < 300_000) {
      return this.profileCache.id;
    }

    const profileName = clean(config.voiceFabricProfileName || DEFAULT_PROFILE_NAME, 120).toLowerCase();
    const explicit = String(config.voiceFabricProfileId || '').trim();
    const list = await this.voices();
    const profile = list.find((row) => {
      const exactIdentity = (
        String(row?.type || '').toLowerCase() === 'profile'
        && String(row?.name || '').trim().toLowerCase() === profileName
        && String(row?.engine_voice || '').trim().toLowerCase() === EXPECTED_ENGINE_VOICE
        && String(row?.language || EXPECTED_LANGUAGE).trim().toLowerCase() === EXPECTED_LANGUAGE
      );
      if (!exactIdentity) return false;
      return !explicit || String(row?.voice_id || '') === explicit;
    });

    this.profileCache = {
      id: String(profile?.voice_id || ''),
      checkedAt: now,
    };

    if (!this.profileCache.id) {
      throw new Error(
        `Mairaiy exact profile ${EXPECTED_ENGINE_VOICE}/${EXPECTED_LANGUAGE} not found in VoiceStudio. A different Mairaiy timbre is forbidden.`,
      );
    }

    return this.profileCache.id;
  }

  async synthesizeChunk(text, options = {}) {
    if (!this.enabled) throw new Error('AURA Voice Fabric provider unavailable');

    const endpoint = this.endpoint;
    const voiceId = await this.resolveMairaiyProfile();
    const body = {
      model: String(config.voiceFabricModel || DEFAULT_MODEL),
      input: clean(text, MAX_INPUT_CHARS),
      voice: voiceId,
      response_format: 'wav',
      speed: Math.max(0.5, Math.min(1.5, Number(options.speed || config.voiceFabricSpeed || 1))),
      language: EXPECTED_LANGUAGE,
      engine_voice: EXPECTED_ENGINE_VOICE,
      denoise: true,
      preprocess_prompt: true,
    };

    const instruct = clean(config.voiceFabricInstruct, 600);
    if (instruct) body.instruct = instruct;
    if (Number.isFinite(config.voiceFabricSeed)) body.seed = config.voiceFabricSeed;

    const started = Date.now();
    const response = await fetch(`${endpoint.api_base}/audio/speech`, {
      method: 'POST',
      headers: authHeaders(config.voiceFabricApiKey, true),
      body: JSON.stringify(body),
      redirect: 'error',
      signal: timeoutSignal(config.voiceFabricTimeoutMs),
    });

    if (!response.ok) throw await responseError(response, 'VoiceStudio synthesis failed');

    const returnedVoice = String(response.headers.get('x-mairaiy-voice') || '').trim().toLowerCase();
    const returnedLanguage = String(response.headers.get('x-mairaiy-language') || EXPECTED_LANGUAGE).trim().toLowerCase();
    if (returnedVoice !== EXPECTED_ENGINE_VOICE) {
      throw new Error(
        `VoiceStudio identity not certified: expected ${EXPECTED_ENGINE_VOICE}, received ${returnedVoice || 'missing-header'}`,
      );
    }
    if (returnedLanguage !== EXPECTED_LANGUAGE) {
      throw new Error(
        `VoiceStudio language mismatch: expected ${EXPECTED_LANGUAGE}, received ${returnedLanguage || 'missing-header'}`,
      );
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('audio/')) {
      throw new Error(`VoiceStudio returned unexpected content type: ${contentType || 'missing'}`);
    }

    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > config.voiceFabricMaxAudioBytes) {
      throw new Error('VoiceStudio audio exceeded configured size limit');
    }

    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) throw new Error('VoiceStudio returned empty audio');
    if (audio.length > config.voiceFabricMaxAudioBytes) {
      throw new Error('VoiceStudio audio exceeded configured size limit');
    }

    this.lastLatencyMs = Date.now() - started;
    this.lastSuccessAt = new Date().toISOString();
    this.lastVoiceId = voiceId;
    this.lastModel = body.model;
    this.lastError = '';

    return {
      audio_base64: audio.toString('base64'),
      mime_type: contentType.split(';')[0] || 'audio/wav',
      generation_ms: this.lastLatencyMs,
      chars: body.input.length,
      engine: 'aura-voice-fabric/voicestudio',
      voice: 'Mairaiy',
      engine_voice: EXPECTED_ENGINE_VOICE,
      language: EXPECTED_LANGUAGE,
      voice_id: voiceId,
      model: body.model,
      profile: 'mairaiy',
      cost_microunits: 0,
    };
  }

  async synthesize(text, options = {}) {
    const transcript = clean(text);
    if (!transcript) throw new Error('Texte vocal vide');
    if (!this.enabled) throw new Error('AURA Voice Fabric non configuré');

    const chunks = splitText(transcript, config.voiceFabricChunkChars);
    const segments = [];
    const started = Date.now();
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        const rendered = await this.synthesizeChunk(chunks[index], options);
        segments.push({
          ...rendered,
          index,
          text_length: chunks[index].length,
        });
      }
      return {
        ok: true,
        audio_base64: segments[0]?.audio_base64 || '',
        mime_type: segments[0]?.mime_type || 'audio/wav',
        segments,
        segment_count: segments.length,
        total_chars: transcript.length,
        engine: 'aura-voice-fabric/voicestudio',
        voice: 'Mairaiy',
        engine_voice: EXPECTED_ENGINE_VOICE,
        language: EXPECTED_LANGUAGE,
        voice_id: segments[0]?.voice_id || '',
        model: segments[0]?.model || config.voiceFabricModel,
        profile: 'mairaiy',
        generation_ms: Date.now() - started,
        cost_microunits: 0,
      };
    } catch (error) {
      this.lastError = redact(
        error?.name === 'TimeoutError' || error?.name === 'AbortError'
          ? 'VoiceStudio timeout'
          : error?.message || error,
      );
      throw new Error(this.lastError);
    }
  }

  diagnostic({ publicView = false } = {}) {
    const endpoint = this.endpoint;
    return {
      version: 'aura-voice-fabric-v1',
      provider: 'voicestudio-openai-compatible',
      enabled: this.enabled,
      configured: endpoint.configured,
      endpoint_trusted: endpoint.trusted,
      endpoint_scope: endpoint.remote ? 'remote-https' : (endpoint.configured ? 'loopback' : 'none'),
      endpoint_reason: endpoint.reason,
      model: String(config.voiceFabricModel || DEFAULT_MODEL),
      profile_name: String(config.voiceFabricProfileName || DEFAULT_PROFILE_NAME),
      profile_id_configured: Boolean(config.voiceFabricProfileId),
      require_profile: Boolean(config.voiceFabricRequireProfile),
      zero_cost_mode: Boolean(config.zeroCostMode),
      zero_cost_confirmed: Boolean(config.voiceFabricZeroCostConfirmed),
      zero_cost_trusted_endpoint: Boolean(this.zeroCostTrusted),
      pinned_quantic_endpoint: Boolean(config.voiceFabricPinQuanticEndpoint),
      strict_identity: Boolean(config.voiceFabricStrictIdentity),
      expected_engine_voice: EXPECTED_ENGINE_VOICE,
      expected_language: EXPECTED_LANGUAGE,
      last_error: this.lastError,
      last_latency_ms: this.lastLatencyMs,
      last_success_at: this.lastSuccessAt,
      last_model: this.lastModel,
      last_voice_id: publicView ? '' : this.lastVoiceId,
      discovery: this.lastDiscovery
        ? {
            ok: Boolean(this.lastDiscovery.ok),
            latency_ms: Number(this.lastDiscovery.latency_ms || 0),
            reason: String(this.lastDiscovery.reason || ''),
          }
        : null,
      license_boundary: 'api-adapter-only-no-voicestudio-source-copied',
    };
  }
}
