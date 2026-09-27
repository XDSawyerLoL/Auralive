import { createHash } from 'node:crypto';
import { config } from './config.js';

const ACTION_KINDS = new Set(['retry', 'research', 'evolution', 'operator', 'wait', 'human']);
const RISK_LEVELS = new Set(['safe', 'review', 'high']);

const EXPERT_SCHEMA = {
  type: 'object',
  properties: {
    diagnosis: { type: 'string' },
    probable_cause: { type: 'string' },
    recommended_action: { type: 'string' },
    action_kind: {
      type: 'string',
      enum: ['retry', 'research', 'evolution', 'operator', 'wait', 'human'],
    },
    confidence: { type: 'number' },
    risk_level: {
      type: 'string',
      enum: ['safe', 'review', 'high'],
    },
    human_required: { type: 'boolean' },
    human_reason: { type: 'string' },
    evidence_needed: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: [
    'diagnosis',
    'probable_cause',
    'recommended_action',
    'action_kind',
    'confidence',
    'risk_level',
    'human_required',
    'human_reason',
    'evidence_needed',
  ],
  additionalProperties: false,
};

const SENSITIVE_KEY = /^(authorization|cookie|set-cookie|password|passwd|secret|credential|credentials|token|access_token|refresh_token|api[_-]?key|private[_-]?key|client_secret)$/i;
const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[opsu]_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
];

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function redactText(value, max = 8000) {
  let text = String(value ?? '');
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, '[REDACTED]');
  }
  return text.slice(0, max);
}

export function sanitizeExpertContext(value, depth = 0) {
  if (depth > 6) return '[TRUNCATED]';
  if (value == null) return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => sanitizeExpertContext(item, depth + 1));
  }
  if (typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      if (SENSITIVE_KEY.test(String(key))) {
        output[key] = '[REDACTED]';
        continue;
      }
      output[key] = sanitizeExpertContext(item, depth + 1);
    }
    return output;
  }
  return redactText(value);
}

export function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  for (const item of payload?.output || []) {
    if (item?.type !== 'message') continue;
    for (const part of item?.content || []) {
      if (
        (part?.type === 'output_text' || part?.type === 'text')
        && typeof part?.text === 'string'
        && part.text.trim()
      ) {
        return part.text.trim();
      }
    }
  }
  return '';
}

function jsonObject(text) {
  const raw = String(text || '').trim()
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return {};
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeAdvice(input = {}) {
  const action = ACTION_KINDS.has(String(input.action_kind || '').toLowerCase())
    ? String(input.action_kind).toLowerCase()
    : 'research';
  const risk = RISK_LEVELS.has(String(input.risk_level || '').toLowerCase())
    ? String(input.risk_level).toLowerCase()
    : 'review';
  return {
    diagnosis: redactText(input.diagnosis || '', 5000),
    probable_cause: redactText(input.probable_cause || '', 5000),
    recommended_action: redactText(input.recommended_action || '', 8000),
    action_kind: action,
    confidence: clamp(input.confidence, 0, 1),
    risk_level: risk,
    human_required: Boolean(input.human_required),
    human_reason: redactText(input.human_reason || '', 4000),
    evidence_needed: Array.isArray(input.evidence_needed)
      ? input.evidence_needed.slice(0, 12).map((item) => redactText(item, 1000))
      : [],
  };
}

function fingerprint(value) {
  return createHash('sha256')
    .update(JSON.stringify(sanitizeExpertContext(value)))
    .digest('hex')
    .slice(0, 24);
}

export class ExpertBridge {
  static VERSION = 'aura-expert-bridge-v1';

  constructor(ai = null) {
    this.ai = ai;
    this.calls = [];
    this.lastConsultAt = '';
    this.lastProvider = '';
    this.lastModel = '';
    this.lastError = '';
    this.cooldowns = new Map();
  }

  get externalAvailable() {
    return Boolean(
      config.expertBridgeEnabled
      && config.expertBridgeApiKey
      && config.expertBridgeBaseUrl
      && config.expertBridgeModel
    );
  }

  get internalAvailable() {
    return Boolean(config.expertBridgeInternalFallback && this.ai?.generate);
  }

  #pruneCalls() {
    const threshold = Date.now() - 60 * 60 * 1000;
    this.calls = this.calls.filter((stamp) => stamp >= threshold);
    for (const [key, stamp] of this.cooldowns.entries()) {
      if (stamp < Date.now() - config.expertBridgeCooldownSeconds * 1000) {
        this.cooldowns.delete(key);
      }
    }
  }

  canConsult(caseData = {}) {
    this.#pruneCalls();
    if (!config.expertBridgeEnabled) return { ok: false, reason: 'disabled' };
    if (!this.externalAvailable && !this.internalAvailable) {
      return { ok: false, reason: 'no-expert-provider' };
    }
    if (this.calls.length >= config.expertBridgeMaxCallsPerHour) {
      return { ok: false, reason: 'hourly-budget' };
    }
    const key = fingerprint(caseData);
    const previous = Number(this.cooldowns.get(key) || 0);
    if (previous && Date.now() - previous < config.expertBridgeCooldownSeconds * 1000) {
      return { ok: false, reason: 'cooldown', fingerprint: key };
    }
    return { ok: true, fingerprint: key };
  }

  async #openAiConsult(context) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.expertBridgeTimeoutMs);
    try {
      const tools = config.expertBridgeWebSearchEnabled
        ? [{ type: 'web_search' }]
        : undefined;
      const response = await fetch(
        `${config.expertBridgeBaseUrl.replace(/\/$/, '')}/responses`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.expertBridgeApiKey}`,
          },
          body: JSON.stringify({
            model: config.expertBridgeModel,
            store: false,
            input: [
              {
                role: 'developer',
                content: [
                  'Tu es l’expert technique externe d’AURA, directrice opérationnelle de Quantic Sillage.',
                  'Tu reçois uniquement un dossier d’incident expurgé de secrets.',
                  'Diagnostique la cause la plus probable et propose la prochaine action minimale, réversible et testable.',
                  'Tu ne contrôles aucun outil et tu ne dois jamais demander à élargir tes privilèges.',
                  'Pour un problème opérationnel réversible, human_required doit être false.',
                  'human_required doit être true uniquement si la résolution exige un secret/credential, une suppression irréversible, un engagement juridique ou financier, une modification de l’autorité fondatrice, une élévation de privilèges ou une décision stratégique réservée au fondateur.',
                  'Choisis action_kind parmi retry, research, evolution, operator, wait, human.',
                ].join(' '),
              },
              {
                role: 'user',
                content: JSON.stringify(context),
              },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'aura_expert_diagnosis',
                strict: true,
                schema: EXPERT_SCHEMA,
              },
            },
            ...(tools ? { tools } : {}),
          }),
        },
      );
      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`Expert API HTTP ${response.status}: ${raw.slice(0, 600)}`);
      }
      const payload = JSON.parse(raw);
      const text = extractResponseText(payload);
      const parsed = jsonObject(text);
      if (!Object.keys(parsed).length) {
        throw new Error('Expert API: réponse structurée introuvable');
      }
      return {
        ...normalizeAdvice(parsed),
        provider: 'openai-responses',
        model: config.expertBridgeModel,
        external: true,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async #internalConsult(context) {
    const prompt = [
      'Retourne UNIQUEMENT un objet JSON avec les clés:',
      'diagnosis, probable_cause, recommended_action, action_kind, confidence, risk_level, human_required, human_reason, evidence_needed.',
      'action_kind ∈ retry|research|evolution|operator|wait|human.',
      'risk_level ∈ safe|review|high.',
      'N’exige une intervention humaine que pour secret/credential, irréversible, juridique/financier, autorité fondatrice ou élévation de privilèges.',
      'Pour tout incident opérationnel réversible, propose une action autonome.',
      '',
      JSON.stringify(context),
    ].join('\n');
    const raw = await this.ai.generate(
      prompt,
      'Tu es le second avis technique d’AURA. Tu diagnostiques sans exécuter.',
      1200,
    );
    const parsed = jsonObject(raw);
    if (!Object.keys(parsed).length) {
      throw new Error('Expert interne: réponse JSON introuvable');
    }
    return {
      ...normalizeAdvice(parsed),
      provider: 'internal-ai-fallback',
      model: String(this.ai?.status?.()?.model || ''),
      external: false,
    };
  }

  async consult(caseData = {}) {
    const sanitized = sanitizeExpertContext(caseData);
    const gate = this.canConsult(sanitized);
    if (!gate.ok) {
      return {
        ok: false,
        skipped: true,
        reason: gate.reason,
        fingerprint: gate.fingerprint || fingerprint(sanitized),
      };
    }

    const stamp = Date.now();
    this.calls.push(stamp);
    this.cooldowns.set(gate.fingerprint, stamp);

    try {
      let advice;
      if (this.externalAvailable) {
        try {
          advice = await this.#openAiConsult(sanitized);
        } catch (error) {
          if (!this.internalAvailable) throw error;
          this.lastError = redactText(error?.message || error, 1000);
          advice = await this.#internalConsult(sanitized);
        }
      } else {
        advice = await this.#internalConsult(sanitized);
      }

      this.lastConsultAt = new Date().toISOString();
      this.lastProvider = advice.provider;
      this.lastModel = advice.model;
      if (advice.external) this.lastError = '';
      return {
        ok: true,
        fingerprint: gate.fingerprint,
        ...advice,
      };
    } catch (error) {
      this.lastError = redactText(error?.message || error, 1000);
      return {
        ok: false,
        skipped: false,
        reason: 'expert-failure',
        error: this.lastError,
        fingerprint: gate.fingerprint,
      };
    }
  }

  status({ publicView = true } = {}) {
    this.#pruneCalls();
    const payload = {
      version: ExpertBridge.VERSION,
      enabled: config.expertBridgeEnabled,
      available: this.externalAvailable || this.internalAvailable,
      external_available: this.externalAvailable,
      internal_fallback: this.internalAvailable,
      provider: this.lastProvider || (
        this.externalAvailable ? 'openai-responses' : (this.internalAvailable ? 'internal-ai-fallback' : 'none')
      ),
      model: this.externalAvailable ? config.expertBridgeModel : this.lastModel,
      calls_last_hour: this.calls.length,
      max_calls_per_hour: config.expertBridgeMaxCallsPerHour,
      cooldown_seconds: config.expertBridgeCooldownSeconds,
      last_consult_at: this.lastConsultAt,
      last_error: this.lastError ? 'unavailable' : '',
    };
    if (!publicView) {
      payload.web_search_enabled = config.expertBridgeWebSearchEnabled;
      payload.min_confidence = config.expertBridgeMinConfidence;
      payload.endpoint = config.expertBridgeBaseUrl;
      payload.key_configured = Boolean(config.expertBridgeApiKey);
      payload.last_error_detail = this.lastError;
    }
    return payload;
  }
}
