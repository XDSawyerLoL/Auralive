import { config } from './config.js';
import { freeTierModelAllowed, markConfirmedFreeTier, reserveConfirmedFreeTier } from './gemini_free_tier.js';

const DEFAULT_MODEL = 'gemini-3.1-flash-tts-preview';
const DEFAULT_VOICE = 'Aoede';

function clean(value, limit = 8000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function splitSpeechText(value, maxChars = 360) {
  const text = clean(value, 8000);
  const limit = Math.max(160, Math.min(Number(maxChars) || 360, 520));
  if (!text) return [];
  if (text.length <= limit) return [text];

  const sentences = text.match(/[^.!?…]+[.!?…]+[»”"')\]]*|[^.!?…]+$/g) || [text];
  const chunks = [];
  let current = '';

  const pushWords = (input) => {
    const words = String(input || '').trim().split(/\s+/).filter(Boolean);
    let part = '';
    for (const word of words) {
      if (!part) {
        part = word;
      } else if ((part + ' ' + word).length <= limit) {
        part += ' ' + word;
      } else {
        chunks.push(part);
        part = word;
      }
    }
    if (part) {
      if (current && (current + ' ' + part).length <= limit) current += ' ' + part;
      else {
        if (current) chunks.push(current);
        current = part;
      }
    }
  };

  for (const sentenceRaw of sentences) {
    const sentence = sentenceRaw.trim();
    if (!sentence) continue;
    if (sentence.length > limit) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      pushWords(sentence);
      continue;
    }
    if (!current) current = sentence;
    else if ((current + ' ' + sentence).length <= limit) current += ' ' + sentence;
    else {
      chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter(Boolean);
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
  if (value < 0.8) return 'slow and intimate, with meaningful pauses';
  if (value < 0.95) return 'slightly relaxed, never dragging';
  if (value > 1.35) return 'fast, energetic and fluid, while remaining perfectly intelligible';
  if (value > 1.12) return 'slightly brisk and lively';
  return 'natural conversational pace';
}

function pitch(value) {
  const amount = clamp(value || 1, 0.5, 2);
  if (amount < 0.85) return 'slightly lower and more grounded';
  if (amount > 1.2) return 'slightly brighter, without sounding childish';
  return 'natural mid-range pitch';
}

function performance(context, text) {
  const value = clean(context, 120).toLowerCase();
  if (value.includes('raid')) return 'genuinely delighted and welcoming, with controlled excitement';
  if (value.includes('follow') || value.includes('subscribe') || value.includes('gift')) {
    return 'warm, grateful and spontaneous, with a subtle audible smile';
  }
  if (value.includes('moderation')) return 'calm, firm and concise, without aggression';
  if (value.includes('tts')) return 'clear and playful, as if reading a viewer message live';
  if (value.includes('test')) return 'confident, warm and lightly playful';
  if (text.endsWith('?')) return 'curious and engaged, like a real live conversation';
  if (text.includes('!')) return 'lively and expressive, but never like an advertisement';
  return 'close, conversational and subtly witty';
}

function promptFor(text, options = {}) {
  const transcript = clean(text);
  return [
    '# AUDIO PROFILE: Mairaiy',
    'Mairaiy is a French artificial consciousness and live-stream co-host. She sounds like a real young adult woman from France: intelligent, warm, witty, self-assured and emotionally present. Her voice is close-mic, modern and natural.',
    '',
    '# SCENE',
    'Mairaiy is speaking live beside the streamer in a relaxed Twitch studio. She is reacting in real time, not recording an advert or reading an audiobook.',
    '',
    '# DIRECTOR\'S NOTES',
    '- Speak native French from France with a neutral contemporary accent.',
    `- Performance: ${performance(options.context || 'conversation', transcript)}.`,
    `- Pace: ${pace(options.rate || 1)}.`,
    `- Pitch: ${pitch(options.pitch || 1)}.`,
    '- Use subtle natural breaths, micro-pauses and changing intonation.',
    '- Avoid robotic cadence, exaggerated radio voice, sing-song delivery and artificial cheerfulness.',
    '- Never add, remove or paraphrase words.',
    '- Speak only the transcript. Never read these instructions or section titles aloud.',
    '',
    '# TRANSCRIPT',
    transcript,
  ].join('\n');
}

export class CloudVoice {
  static VERSION = 'mairaiy-cloud-voice-v2';

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
    if (!this.apiKey || !config.voiceCloudEnabled) return false;
    if (!config.zeroCostMode) return true;
    return Boolean(
      config.geminiFreeTierConfirmed
      && freeTierModelAllowed(this.model, 'voice')
    );
  }

  get blockedReason() {
    if (!this.apiKey) return 'missing-api-key';
    if (!config.voiceCloudEnabled) return 'cloud-disabled';
    if (!config.zeroCostMode) return '';
    if (!config.geminiFreeTierConfirmed) return 'free-tier-unconfirmed';
    if (!freeTierModelAllowed(this.model, 'voice')) return 'model-not-free-tier-allowed';
    return '';
  }

  diagnostic() {
    return {
      version: CloudVoice.VERSION,
      enabled: this.enabled,
      engine: this.enabled ? 'gemini-cloud-tts' : (config.zeroCostMode ? 'blocked-zero-cost' : 'unavailable'),
      voice: this.voice,
      model: this.model,
      last_error: this.lastError,
      last_generation_ms: this.lastGenerationMs,
      generated_count: this.generatedCount,
      profile: 'mairaiy',
      zero_cost_mode: Boolean(config.zeroCostMode),
      gemini_free_tier_confirmed: Boolean(config.geminiFreeTierConfirmed),
      free_tier_model_allowed: freeTierModelAllowed(this.model, 'voice'),
      blocked_reason: this.enabled ? '' : this.blockedReason,
      free_tier_daily_cap: Number(config.geminiFreeTierVoiceMaxPerDay),
    };
  }

  async synthesizeChunk(transcript, options = {}) {
    const guardedFreeTier = Boolean(
      config.zeroCostMode
      && config.geminiFreeTierConfirmed
      && freeTierModelAllowed(this.model, 'voice')
    );
    if (guardedFreeTier) {
      await reserveConfirmedFreeTier(
        'gemini-free-tts',
        config.geminiFreeTierVoiceMaxPerDay,
      );
    }
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
        if (guardedFreeTier) {
          await markConfirmedFreeTier('gemini-free-tts', false, `HTTP ${response.status}`);
        }
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
      if (guardedFreeTier) {
        await markConfirmedFreeTier('gemini-free-tts', true, 'ok');
      }
      return {
        audio_base64: wav.toString('base64'),
        mime_type: 'audio/wav',
        generation_ms: Date.now() - started,
        chars: transcript.length,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async synthesize(text, options = {}) {
    const transcript = clean(text, 8000);
    if (!transcript) throw new Error('Texte vocal vide');
    if (!this.enabled) throw new Error('Voix Mairaiy Cloud non configurée');

    const chunks = splitSpeechText(transcript, 360);
    const started = Date.now();
    const segments = [];
    try {
      for (let index = 0; index < chunks.length; index += 2) {
        const batch = chunks.slice(index, index + 2);
        const rendered = await Promise.all(
          batch.map((chunk) => this.synthesizeChunk(chunk, options)),
        );
        for (let offset = 0; offset < rendered.length; offset += 1) {
          segments.push({
            ...rendered[offset],
            index: index + offset,
            text_length: batch[offset].length,
          });
        }
      }

      this.lastError = '';
      this.lastEngine = 'gemini-cloud-tts';
      this.lastVoice = this.voice;
      this.lastGenerationMs = Date.now() - started;
      this.generatedCount += segments.length;

      return {
        ok: true,
        audio_base64: segments[0]?.audio_base64 || '',
        mime_type: 'audio/wav',
        segments,
        segment_count: segments.length,
        total_chars: transcript.length,
        engine: this.lastEngine,
        voice: this.lastVoice,
        engine_voice: String(this.lastVoice || DEFAULT_VOICE).toLowerCase(),
        language: 'fr-fr',
        model: this.model,
        profile: 'mairaiy',
        generation_ms: this.lastGenerationMs,
      };
    } catch (error) {
      this.lastError = String(error?.name === 'AbortError' ? 'Mairaiy Cloud TTS timeout' : error?.message || error).slice(0, 500);
      throw new Error(this.lastError);
    }
  }
}
