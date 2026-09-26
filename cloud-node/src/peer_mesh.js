import {
  createHash,
  createPublicKey,
  randomUUID,
  verify as verifySignature,
} from 'node:crypto';

import { config } from './config.js';
import { one, query } from './db.js';

const nowIso = () => new Date().toISOString();
const nowMs = () => Date.now();

function clean(value, limit = 4000) {
  return String(value ?? '').trim().slice(0, limit);
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map((item) => stable(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stable(value));
}

export function peerIdForJwk(publicJwk = {}) {
  const digest = createHash('sha256')
    .update(stableStringify(publicJwk))
    .digest('hex');
  return `peer-${digest.slice(0, 48)}`;
}

function validateTimestamp(value) {
  const timestamp = Number(value || 0);
  if (!Number.isFinite(timestamp)) return false;
  return Math.abs(nowMs() - timestamp) <= config.meshPeerClockSkewMs;
}

export function verifyPeerEnvelope(publicJwk, envelope, signature) {
  try {
    if (!publicJwk || typeof publicJwk !== 'object') return false;
    if (!envelope || typeof envelope !== 'object') return false;
    if (!validateTimestamp(envelope.timestamp)) return false;
    const key = createPublicKey({ key: publicJwk, format: 'jwk' });
    return verifySignature(
      'sha256',
      Buffer.from(stableStringify(envelope), 'utf8'),
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(String(signature || ''), 'base64url'),
    );
  } catch {
    return false;
  }
}

function normalizeCaps(value) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => clean(item, 80))
      .filter(Boolean),
  )].slice(0, 32);
}

function normalizeResources(value) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    hardware_concurrency: Math.max(0, Math.min(Number(raw.hardware_concurrency || 0), 512)),
    device_memory_gb: Math.max(0, Math.min(Number(raw.device_memory_gb || 0), 1024)),
    webgpu: Boolean(raw.webgpu),
    adapter: clean(raw.adapter, 500),
    platform: clean(raw.platform, 200),
  };
}

export class PeerMesh {
  static VERSION = 'aura-peer-mesh-v0.2';

  constructor() {
    this.lastError = '';
    this.lastSessionAt = '';
  }

  get enabled() {
    return Boolean(config.meshP2pEnabled);
  }

  async register(payload = {}) {
    if (!this.enabled) throw new Error('AURA Peer Mesh désactivé');
    const peerId = clean(payload.peer_id, 80);
    const workerId = clean(payload.worker_id, 160);
    const publicJwk = payload.public_jwk && typeof payload.public_jwk === 'object'
      ? payload.public_jwk
      : {};
    const envelope = payload.envelope && typeof payload.envelope === 'object'
      ? payload.envelope
      : {};
    if (!peerId || !workerId) throw new Error('peer_id et worker_id requis');
    if (peerIdForJwk(publicJwk) !== peerId) throw new Error('peer_id invalide');
    if (envelope.type !== 'register' && envelope.type !== 'heartbeat') {
      throw new Error('enveloppe Peer Mesh invalide');
    }
    if (String(envelope.peer_id || '') !== peerId || String(envelope.worker_id || '') !== workerId) {
      throw new Error('identité Peer Mesh incohérente');
    }
    if (!verifyPeerEnvelope(publicJwk, envelope, payload.signature)) {
      throw new Error('signature Peer Mesh invalide');
    }
    const capabilities = normalizeCaps(envelope.capabilities);
    const resources = normalizeResources(envelope.resources);
    const timestamp = nowIso();
    await query(
      `INSERT INTO aura_mesh_peers(
        peer_id,worker_id,public_jwk,capabilities,resources,reputation,enabled,
        last_seen_at,last_seen_ms,created_at,updated_at
      ) VALUES(?,?,?,?,?,0.5,1,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        worker_id=VALUES(worker_id),
        public_jwk=VALUES(public_jwk),
        capabilities=VALUES(capabilities),
        resources=VALUES(resources),
        enabled=1,
        last_seen_at=VALUES(last_seen_at),
        last_seen_ms=VALUES(last_seen_ms),
        updated_at=VALUES(updated_at)`,
      [
        peerId,
        workerId,
        JSON.stringify(publicJwk).slice(0, 16000),
        JSON.stringify(capabilities).slice(0, 8000),
        JSON.stringify(resources).slice(0, 16000),
        timestamp,
        nowMs(),
        timestamp,
        timestamp,
      ],
    );
    return {
      ok: true,
      peer_id: peerId,
      capabilities,
      server_time: timestamp,
      ice_servers: config.meshIceServers,
    };
  }

  async getPeer(peerId) {
    const row = await one(
      `SELECT peer_id,worker_id,public_jwk,capabilities,resources,reputation,
              enabled,last_seen_at,last_seen_ms
       FROM aura_mesh_peers WHERE peer_id=?`,
      [clean(peerId, 80)],
    );
    if (!row) return null;
    return {
      peer_id: row.peer_id,
      worker_id: row.worker_id,
      public_jwk: parseJson(row.public_jwk, {}),
      capabilities: normalizeCaps(parseJson(row.capabilities, [])),
      resources: normalizeResources(parseJson(row.resources, {})),
      reputation: Math.max(0, Math.min(1, Number(row.reputation || 0.5))),
      enabled: Boolean(Number(row.enabled || 0)),
      last_seen_at: row.last_seen_at || '',
      last_seen_ms: Number(row.last_seen_ms || 0),
    };
  }

  async peers({ capability = '', workerId = '', onlineOnly = true } = {}) {
    const rows = await query(
      `SELECT peer_id,worker_id,public_jwk,capabilities,resources,reputation,
              enabled,last_seen_at,last_seen_ms
       FROM aura_mesh_peers
       WHERE enabled=1
       ORDER BY reputation DESC,last_seen_ms DESC LIMIT 256`,
    );
    const required = clean(capability, 80);
    const owner = clean(workerId, 160);
    return rows.map((row) => ({
      peer_id: row.peer_id,
      worker_id: row.worker_id,
      public_jwk: parseJson(row.public_jwk, {}),
      capabilities: normalizeCaps(parseJson(row.capabilities, [])),
      resources: normalizeResources(parseJson(row.resources, {})),
      reputation: Math.max(0, Math.min(1, Number(row.reputation || 0.5))),
      enabled: Boolean(Number(row.enabled || 0)),
      last_seen_at: row.last_seen_at || '',
      last_seen_ms: Number(row.last_seen_ms || 0),
    })).filter((item) => {
      if (onlineOnly && nowMs() - item.last_seen_ms > config.meshPeerOnlineMs) return false;
      if (required && !item.capabilities.includes(required)) return false;
      if (owner && item.worker_id !== owner) return false;
      return true;
    });
  }

  async assertOwnedPeer(peerId, workerId) {
    const peer = await this.getPeer(peerId);
    if (!peer) throw new Error('pair inconnu');
    if (peer.worker_id !== clean(workerId, 160)) throw new Error('pair non lié à ce worker');
    if (!peer.enabled) throw new Error('pair désactivé');
    return peer;
  }

  async signal(payload = {}) {
    const envelope = payload.envelope && typeof payload.envelope === 'object'
      ? payload.envelope
      : {};
    const fromPeer = await this.getPeer(envelope.from_peer_id);
    if (!fromPeer) throw new Error('pair émetteur inconnu');
    await this.assertOwnedPeer(fromPeer.peer_id, payload.worker_id);
    if (!verifyPeerEnvelope(fromPeer.public_jwk, envelope, payload.signature)) {
      throw new Error('signature signal P2P invalide');
    }
    const toPeer = clean(envelope.to_peer_id, 80);
    const sessionId = clean(envelope.session_id, 80);
    const signalType = clean(envelope.signal_type, 40);
    const nonce = clean(envelope.nonce, 100);
    if (!toPeer || !sessionId || !signalType || !nonce) throw new Error('signal P2P incomplet');
    if (!await this.getPeer(toPeer)) throw new Error('pair destinataire inconnu');
    const result = await query(
      `INSERT IGNORE INTO aura_mesh_signals(
        session_id,from_peer_id,to_peer_id,signal_type,payload,signature,nonce,
        created_at,created_ms,consumed
      ) VALUES(?,?,?,?,?,?,?,?,?,0)`,
      [
        sessionId,
        fromPeer.peer_id,
        toPeer,
        signalType,
        JSON.stringify(envelope.payload ?? {}).slice(0, 200000),
        clean(payload.signature, 4000),
        nonce,
        nowIso(),
        nowMs(),
      ],
    );
    return { ok: true, inserted: Number(result.affectedRows || 0) > 0 };
  }

  async pushServerSignal(toPeerId, sessionId, signalType, payload = {}) {
    await query(
      `INSERT INTO aura_mesh_signals(
        session_id,from_peer_id,to_peer_id,signal_type,payload,signature,nonce,
        created_at,created_ms,consumed
      ) VALUES(?,?,?,?,?,'server',?,?,?,0)`,
      [
        clean(sessionId, 80),
        'aura-cloud',
        clean(toPeerId, 80),
        clean(signalType, 40),
        JSON.stringify(payload || {}).slice(0, 200000),
        randomUUID(),
        nowIso(),
        nowMs(),
      ],
    );
  }

  async poll(peerId, workerId, afterId = 0) {
    const peer = await this.assertOwnedPeer(peerId, workerId);
    const rows = await query(
      `SELECT id,session_id,from_peer_id,to_peer_id,signal_type,payload,signature,created_at
       FROM aura_mesh_signals
       WHERE to_peer_id=? AND consumed=0 AND id>? ORDER BY id ASC LIMIT 100`,
      [peer.peer_id, Math.max(0, Number(afterId || 0))],
    );
    const senderIds = [...new Set(rows.map((row) => row.from_peer_id).filter((id) => id !== 'aura-cloud'))];
    const senders = new Map();
    for (const id of senderIds) {
      const sender = await this.getPeer(id);
      if (sender) senders.set(id, sender);
    }
    if (rows.length) {
      const ids = rows.map((row) => Number(row.id)).filter(Number.isFinite);
      if (ids.length) {
        await query(
          `UPDATE aura_mesh_signals SET consumed=1
           WHERE to_peer_id=? AND id<=?`,
          [peer.peer_id, Math.max(...ids)],
        ).catch(() => {});
      }
    }
    return {
      peer_id: peer.peer_id,
      signals: rows.map((row) => ({
        id: Number(row.id),
        session_id: row.session_id,
        from_peer_id: row.from_peer_id,
        to_peer_id: row.to_peer_id,
        signal_type: row.signal_type,
        payload: parseJson(row.payload, {}),
        signature: row.signature,
        from_public_jwk: senders.get(row.from_peer_id)?.public_jwk || null,
        created_at: row.created_at,
      })),
    };
  }

  async createSession(capability, task = {}) {
    const required = clean(capability || 'webgpu', 80);
    const targetCandidates = await this.peers({ capability: required, onlineOnly: true });
    const allPeers = await this.peers({ capability: 'webrtc', onlineOnly: true });
    const target = targetCandidates[0];
    if (!target) throw new Error(`Aucun pair P2P compatible ${required}`);
    const initiator = allPeers.find((item) => item.peer_id !== target.peer_id);
    if (!initiator) throw new Error('Le P2P exige au moins deux pairs WebRTC en ligne');

    const id = randomUUID();
    const timestamp = nowIso();
    await query(
      `INSERT INTO aura_mesh_sessions(
        id,capability,initiator_peer_id,target_peer_id,task,status,result,error,
        verification,created_at,updated_at
      ) VALUES(?,?,?,?,?,'negotiating','{}','','{}',?,?)`,
      [
        id,
        required,
        initiator.peer_id,
        target.peer_id,
        JSON.stringify(task || {}).slice(0, 500000),
        timestamp,
        timestamp,
      ],
    );
    await this.pushServerSignal(initiator.peer_id, id, 'server-start', {
      target_peer_id: target.peer_id,
      target_public_jwk: target.public_jwk,
      capability: required,
      task,
      ice_servers: config.meshIceServers.map((urls) => ({ urls })),
    });
    this.lastSessionAt = timestamp;
    return { id, capability: required, initiator, target, status: 'negotiating' };
  }

  async completeSession(payload = {}) {
    const envelope = payload.envelope && typeof payload.envelope === 'object'
      ? payload.envelope
      : {};
    const sessionId = clean(envelope.session_id, 80);
    const session = await one(
      `SELECT id,capability,initiator_peer_id,target_peer_id,task,status
       FROM aura_mesh_sessions WHERE id=?`,
      [sessionId],
    );
    if (!session) throw new Error('session P2P inconnue');
    if (String(envelope.peer_id || '') !== session.initiator_peer_id) {
      throw new Error('seul le pair initiateur peut finaliser la session');
    }
    const initiator = await this.assertOwnedPeer(session.initiator_peer_id, payload.worker_id);
    if (!verifyPeerEnvelope(initiator.public_jwk, envelope, payload.signature)) {
      throw new Error('signature initiateur P2P invalide');
    }

    const targetPacket = envelope.target_packet && typeof envelope.target_packet === 'object'
      ? envelope.target_packet
      : {};
    const targetEnvelope = targetPacket.envelope && typeof targetPacket.envelope === 'object'
      ? targetPacket.envelope
      : {};
    const target = await this.getPeer(session.target_peer_id);
    if (!target) throw new Error('pair cible P2P introuvable');
    if (String(targetEnvelope.peer_id || '') !== target.peer_id
      || String(targetEnvelope.session_id || '') !== session.id
      || targetEnvelope.type !== 'result') {
      throw new Error('résultat P2P incohérent');
    }
    if (!verifyPeerEnvelope(target.public_jwk, targetEnvelope, targetPacket.signature)) {
      throw new Error('signature résultat P2P invalide');
    }
    const expectedTaskHash = createHash('sha256')
      .update(stableStringify(parseJson(session.task, {})))
      .digest('hex');
    if (String(targetEnvelope.task_hash || '') !== expectedTaskHash) {
      throw new Error('résultat P2P lié à une autre tâche');
    }

    const result = targetEnvelope.result ?? {};
    const verification = {
      transport: 'webrtc-datachannel',
      dtls: true,
      initiator_peer_id: initiator.peer_id,
      target_peer_id: target.peer_id,
      initiator_signature: true,
      target_signature: true,
      task_hash: expectedTaskHash,
    };
    await query(
      `UPDATE aura_mesh_sessions
       SET status='completed',result=?,verification=?,error='',updated_at=?
       WHERE id=?`,
      [
        JSON.stringify(result).slice(0, 500000),
        JSON.stringify(verification).slice(0, 16000),
        nowIso(),
        session.id,
      ],
    );
    await query(
      `UPDATE aura_mesh_peers SET
        reputation=LEAST(0.99,GREATEST(0.05,reputation*0.9+0.1)),
        updated_at=? WHERE peer_id IN (?,?)`,
      [nowIso(), initiator.peer_id, target.peer_id],
    ).catch(() => {});
    return { ok: true, id: session.id, result, verification };
  }

  async getSession(id) {
    const row = await one(
      `SELECT id,capability,initiator_peer_id,target_peer_id,task,status,result,error,
              verification,created_at,updated_at
       FROM aura_mesh_sessions WHERE id=?`,
      [clean(id, 80)],
    );
    if (!row) return null;
    return {
      ...row,
      task: parseJson(row.task, {}),
      result: parseJson(row.result, {}),
      verification: parseJson(row.verification, {}),
    };
  }

  async waitSession(id, timeoutMs = config.meshP2pTimeoutMs) {
    const deadline = nowMs() + Math.max(3000, Number(timeoutMs || config.meshP2pTimeoutMs));
    while (nowMs() < deadline) {
      const row = await this.getSession(id);
      if (!row) throw new Error('session P2P disparue');
      if (row.status === 'completed') return row;
      if (row.status === 'error') throw new Error(row.error || 'échec session P2P');
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await query(
      `UPDATE aura_mesh_sessions SET status='error',error='timeout P2P',updated_at=?
       WHERE id=? AND status NOT IN ('completed','error')`,
      [nowIso(), clean(id, 80)],
    ).catch(() => {});
    throw new Error('AURA Peer Mesh timeout');
  }

  async execute(capability, task = {}, options = {}) {
    const started = nowMs();
    const session = await this.createSession(capability, task);
    const completed = await this.waitSession(session.id, options.timeoutMs);
    return {
      ok: true,
      result: completed.result,
      verification: completed.verification,
      metrics: {
        elapsed_ms: nowMs() - started,
        p2p_peers: 2,
        cost_microunits: 0,
      },
      session_id: completed.id,
    };
  }

  async status() {
    const peers = await this.peers({ onlineOnly: true });
    const sessions = await one(
      `SELECT
        SUM(CASE WHEN status='negotiating' THEN 1 ELSE 0 END) AS negotiating,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors
       FROM aura_mesh_sessions`,
    );
    return {
      version: PeerMesh.VERSION,
      enabled: this.enabled,
      online_peers: peers.length,
      webgpu_peers: peers.filter((item) => item.capabilities.includes('webgpu')).length,
      webrtc_peers: peers.filter((item) => item.capabilities.includes('webrtc')).length,
      ice_servers: config.meshIceServers,
      sessions: {
        negotiating: Number(sessions?.negotiating || 0),
        completed: Number(sessions?.completed || 0),
        errors: Number(sessions?.errors || 0),
      },
      last_session_at: this.lastSessionAt,
      last_error: this.lastError,
    };
  }
}
