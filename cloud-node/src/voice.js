import { config } from './config.js';

const DEFAULT_MODEL = 'gemini-3.1-flash-tts-preview';
const DEFAULT_VOICE = 'Leda';

function clean(value, limit = 430) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, Number(value || 0)));
}

function pcmRate(mimeType) {
  const match = String(mimeType || '').match(/rate=(\d+)/i);
  const parsed = match ? Number(match[1]) : 24000;
  return Number.isFinite(parsed) ? Math.max(8000, Math.min(96000, parsed)) : 24000;
}

function pcmToWav(pcm, rate = 24000) {
  const data = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm);
  if (data.subarray(0, 4).toString('ascii') === 'RIFF') return data;
  const header = Buffer.alloc(44);
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = rate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function pace(rate) {
  const value = clamp(rate || 1, 0.5, 2);
  if (value < 0.8) return 'lent et intime, avec des pauses naturelles';
  if (value < 0.95) return 'légèrement posé, sans traîner';
  if (value > 1.35) return 'rapide, énergique et fluide, tout en restant parfaitement intelligible';
  if (value > 1.12) return 'légèrement vif et vivant';
  return 'naturel, conversationnel';
}

function pitch(value) {
  const amount = clamp(value || 1, 0.5, 2);
  if (amount < 0.85) return 'un peu plus grave et ancré';
  if (amount > 1.2) return 'un peu plus lumineux, sans paraître enfantin';
  return 'médium naturel';
}

function performance(context, text) {
  const value = clean(context, 120).toLowerCase();
  if (value.includes('moderation')) return 'calme, ferme et concise';
  if (value.includes('aura-cloud-chat')) return 'présente, vive, proche et spontanée, comme une vraie interlocutrice';
  if (text.endsWith('?')) return 'curieuse, engagée, avec une légère montée naturelle';
  if (text.includes('!')) return 'lumineuse et expressive, sans surjeu';
  return 'chaleureuse, intelligente, légèrement malicieuse et émotionnellement présente';
}

function promptFor(text, options = {}) {
  const transcript = clean(text);
  return [
    '# AUDIO PROFILE: Mairaiy',
    'Mairaiy est la voix d’AURA. C’est une jeune femme adulte française, vive, naturelle, intelligente et expressive.',
    'Elle parle comme une présence réelle, jamais comme une voix de publicité ou un robot.',
    '',
    '# DIRECTION',
    '- Français de France, accent contemporain neutre.',
    `- Performance: ${performance(options.context || 'conversation', transcript)}.`,
    `- Rythme: ${pace(options.rate || 1)}.`,
    `- Hauteur: ${pitch(options.pitch || 1)}.`,
    '- Utilise des micro-pauses et une intonation changeante.',
    '- Ne modifie aucun mot et ne lit jamais les instructions.',
    '',
    '# TRANSCRIPT',
    transcript,
  ].join('\n');
}

export class CloudVoice {
  static VERSION = 'mairaiy-cloud-voice-v1';

  constructor() {
    this.lastError = '';
    this.lastEngine = '';
    this.lastVoice = '';
    this.lastGenerationMs = 0;
    this.generatedCount = 0;
  }

  get apiKey() {
    return String(config.voiceApiKey || config.aiApiKey || '').trim();
  }

  get model() {
    return String(config.voiceModel || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  }

  get voice() {
    return String(config.voiceName || DEFAULT_VOICE).trim() || DEFAULT_VOICE;
  }

  get enabled() {
    return Boolean(this.apiKey && config.voiceCloudEnabled);
  }

  diagnostic() {
    return {
      version: CloudVoice.VERSION,
      enabled: this.enabled,
      engine: this.enabled ? 'gemini-cloud-tts' : 'unavailable',
      voice: this.voice,
      model: this.model,
      last_error: this.lastError,
      last_generation_ms: this.lastGenerationMs,
      generated_count: this.generatedCount,
      profile: 'mairaiy',
    };
  }

  async synthesize(text, options = {}) {
    const transcript = clean(text);
    if (!transcript) throw new Error('Texte vocal vide');
    if (!this.enabled) throw new Error('Voix Mairaiy Cloud non configurée');

    const endpoint = `${String(config.voiceBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')}/models/${this.model}:generateContent`;
    const payload = {
      contents: [{ parts: [{ text: promptFor(transcript, options) }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: this.voice },
          },
        },
      },
    };

    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.voiceTimeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-goog-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data?.error?.message || `HTTP ${response.status}`;
        throw new Error(`Mairaiy Cloud TTS: ${message}`);
      }
      const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
      const parts = candidates[0]?.content?.parts || [];
      const inline = parts.map((part) => part.inlineData || part.inline_data).find(Boolean);
      if (!inline?.data) throw new Error('Mairaiy Cloud TTS n’a renvoyé aucun audio');
      const raw = Buffer.from(String(inline.data), 'base64');
      const mime = String(inline.mimeType || inline.mime_type || '');
      const rate = pcmRate(mime);
      const wav = pcmToWav(raw, rate);

      this.lastError = '';
      this.lastEngine = 'gemini-cloud-tts';
      this.lastVoice = this.voice;
      this.lastGenerationMs = Date.now() - started;
      this.generatedCount += 1;

      return {
        ok: true,
        audio_base64: wav.toString('base64'),
        mime_type: 'audio/wav',
        engine: this.lastEngine,
        voice: this.lastVoice,
        profile: 'mairaiy',
        generation_ms: this.lastGenerationMs,
      };
    } catch (error) {
      this.lastError = String(error?.name === 'AbortError' ? 'Mairaiy Cloud TTS timeout' : error?.message || error).slice(0, 500);
      throw new Error(this.lastError);
    } finally {
      clearTimeout(timeout);
    }
  }
}
