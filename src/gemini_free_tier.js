import { config, databaseConfigured } from './config.js';
import { one, query } from './db.js';

const memoryUsage = new Map();

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function key(provider, date = todayUtc()) {
  return `${String(provider || 'unknown')}:${date}`;
}

export async function reserveConfirmedFreeTier(provider, limit) {
  if (!config.geminiFreeTierConfirmed) {
    throw new Error('Gemini free tier not confirmed by operator');
  }

  const max = Math.max(1, Number(limit || 1));
  const date = todayUtc();
  let requests = Number(memoryUsage.get(key(provider, date)) || 0);

  if (databaseConfigured()) {
    try {
      const row = await one(
        'SELECT requests FROM aura_free_provider_usage WHERE provider=? AND usage_date=?',
        [provider, date],
      );
      requests = Math.max(requests, Number(row?.requests || 0));
    } catch {
      // The in-memory guard remains active if the optional persistent ledger is unavailable.
    }
  }

  if (requests >= max) {
    throw new Error(`${provider} confirmed free-tier daily cap reached (${requests}/${max})`);
  }

  requests += 1;
  memoryUsage.set(key(provider, date), requests);

  if (databaseConfigured()) {
    try {
      await query(
        `INSERT INTO aura_free_provider_usage(
           provider,usage_date,requests,failures,last_status,updated_at
         ) VALUES(?,?,1,0,'reserved',?)
         ON DUPLICATE KEY UPDATE
           requests=requests+1,
           last_status='reserved',
           updated_at=VALUES(updated_at)`,
        [provider, date, new Date().toISOString()],
      );
    } catch {
      // Never disable the guard merely because its persistent ledger is unavailable.
    }
  }

  return { provider, date, requests, limit: max };
}

export async function markConfirmedFreeTier(provider, ok, status = '') {
  if (!databaseConfigured()) return;
  try {
    await query(
      `UPDATE aura_free_provider_usage
       SET failures=failures+?,last_status=?,updated_at=?
       WHERE provider=? AND usage_date=?`,
      [
        ok ? 0 : 1,
        String(status || (ok ? 'ok' : 'error')).slice(0,120),
        new Date().toISOString(),
        provider,
        todayUtc(),
      ],
    );
  } catch {
    // Diagnostics only.
  }
}

export function freeTierModelAllowed(model, kind = 'text') {
  const value = String(model || '').trim().toLowerCase();
  if (kind === 'voice') {
    return value === 'gemini-3.1-flash-tts-preview';
  }
  return value === 'gemini-3.5-flash-lite';
}
