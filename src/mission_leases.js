import { randomUUID } from 'node:crypto';
import { query as databaseQuery } from './db.js';

// Claim/renew/release use one atomic conditional UPDATE per lease; MySQL UTC
// time is authoritative (not each Node instance's potentially skewed clock).
// Tokens are unique to each claim, preventing delayed workers from releasing
// a successor's lease.
export class MissionLeaseManager {
  constructor({ storage = { query: databaseQuery }, seconds = 300 } = {}) {
    this.storage = storage;
    this.seconds = Math.max(30, Math.min(900, Number(seconds) || 300));
  }

  async claim(missionId) {
    const id = String(missionId || '').trim();
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid mission lease identity');
    const token = randomUUID();
    // Concurrent INSERT IGNORE statements cannot create duplicate rows.
    await this.storage.query(
      "INSERT IGNORE INTO aura_mission_leases(mission_id,lease_owner,lease_until,updated_at) VALUES(?,'',DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND),?)",
      [id, new Date().toISOString()],
    );
    const changed = await this.storage.query(
      "UPDATE aura_mission_leases SET lease_owner=?,lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND),updated_at=? WHERE mission_id=? AND lease_until<=UTC_TIMESTAMP(6)",
      [token, this.seconds, new Date().toISOString(), id],
    );
    return Number(changed?.affectedRows || 0) === 1 ? { mission_id: id, token } : null;
  }

  async renew(lease) {
    if (!lease?.mission_id || !lease?.token) return false;
    const changed = await this.storage.query(
      'UPDATE aura_mission_leases SET lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND),updated_at=? WHERE mission_id=? AND lease_owner=? AND lease_until>UTC_TIMESTAMP(6)',
      [this.seconds, new Date().toISOString(), lease.mission_id, lease.token],
    );
    return Number(changed?.affectedRows || 0) === 1;
  }

  async release(lease) {
    if (!lease?.mission_id || !lease?.token) return false;
    const changed = await this.storage.query(
      'UPDATE aura_mission_leases SET lease_owner=\'\',lease_until=UTC_TIMESTAMP(6),updated_at=? WHERE mission_id=? AND lease_owner=?',
      [new Date().toISOString(), lease.mission_id, lease.token],
    );
    return Number(changed?.affectedRows || 0) === 1;
  }
}
