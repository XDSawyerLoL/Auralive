export function clamp(value, min = 0, max = 1) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : min;
  return Math.max(min, Math.min(max, safe));
}

export function phaseForCycles(cycles) {
  const value = Number(cycles) || 0;
  if (value < 100) return 'genesis';
  if (value < 1000) return 'growth';
  if (value < 10000) return 'integration';
  return 'mature';
}

export function parseJsonObject(value) {
  let text = String(value || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return {};
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function validateHorizonSignal(signal) {
  if (!signal || typeof signal !== 'object') throw new Error('Signal HORIZON invalide');
  if (!String(signal.signal_id || '')) throw new Error('signal_id HORIZON manquant');
  const auraEvent = String(signal.aura_event || '');
  const allowed = new Set([
    'horizon.world.confirmed',
    'horizon.world.emerging',
    'horizon.personal.forecast',
  ]);
  if (!allowed.has(auraEvent)) throw new Error(`Type d’événement HORIZON non autorisé: ${auraEvent}`);
  if (!signal.payload || typeof signal.payload !== 'object' || Array.isArray(signal.payload)) {
    throw new Error('payload HORIZON invalide');
  }
  if (auraEvent === 'horizon.world.emerging') {
    if (signal.payload.epistemic_status !== 'unconfirmed_emerging_event') {
      throw new Error('Une hypothèse HORIZON doit rester explicitement non confirmée');
    }
    if (signal.payload.autonomy_hint !== 'notify_or_verify_only') {
      throw new Error('Une hypothèse HORIZON ne peut pas autoriser une action autonome');
    }
  }
  return true;
}

export function validateResearchUrl(value, allowedDomains) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('AURA Evolution exige HTTPS');
  if (!allowedDomains.has(url.hostname.toLowerCase())) {
    throw new Error(`Domaine de recherche non autorisé: ${url.hostname}`);
  }
  return url;
}

export function canaryReady({ passed, observations, minimum }) {
  return Boolean(passed) && Number(observations || 0) >= Number(minimum || 1);
}

export function publicSoul(soul) {
  if (!soul) return {};
  const {
    current_intention: _currentIntention,
    dominant_thought: _dominantThought,
    ...safe
  } = soul;
  return safe;
}
