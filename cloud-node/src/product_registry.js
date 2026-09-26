import { createHash } from 'node:crypto';
import { one, query } from './db.js';

const now = () => new Date().toISOString();
const nowMs = () => Date.now();

function clean(value, limit = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}
function list(value, limit = 128) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => clean(item, 180)).filter(Boolean))].slice(0, limit);
}
function json(value, fallback = {}) {
  try { return JSON.parse(value || '') ?? fallback; } catch { return fallback; }
}
function productId(value) {
  return clean(value, 100).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}
function tokenHash(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

export class ProductRegistry {
  static VERSION = 'aura-everywhere-v0.1';

  constructor({ offlineMs = 180000 } = {}) {
    this.offlineMs = Math.max(30000, Number(offlineMs || 180000));
  }

  async register(payload = {}) {
    const id = productId(payload.id);
    const name = clean(payload.name, 160);
    if (!id || !name) throw new Error('product id et name requis');
    const capabilities = list(payload.capabilities);
    const permissions = list(payload.permissions);
    const surfaces = list(payload.surfaces);
    const version = clean(payload.version, 120);
    const repository = clean(payload.repository, 300);
    const endpoint = clean(payload.endpoint, 1000);
    const instanceId = clean(payload.instance_id || payload.instanceId || 'default', 160);
    const stamp = now();
    const stampMs = nowMs();
    const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
    const fingerprint = tokenHash(JSON.stringify({ id, instanceId, version, capabilities, permissions, surfaces })).slice(0, 40);

    await query(
      `INSERT INTO aura_products(
        id,name,version,repository,endpoint,capabilities,permissions,surfaces,state,
        instance_id,fingerprint,last_seen_at,last_seen_ms,metadata,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        name=VALUES(name),version=VALUES(version),repository=VALUES(repository),
        endpoint=VALUES(endpoint),capabilities=VALUES(capabilities),permissions=VALUES(permissions),
        surfaces=VALUES(surfaces),state='online',instance_id=VALUES(instance_id),
        fingerprint=VALUES(fingerprint),last_seen_at=VALUES(last_seen_at),
        last_seen_ms=VALUES(last_seen_ms),metadata=VALUES(metadata),updated_at=VALUES(updated_at)`,
      [
        id,name,version,repository,endpoint,JSON.stringify(capabilities),JSON.stringify(permissions),
        JSON.stringify(surfaces),'online',instanceId,fingerprint,stamp,stampMs,
        JSON.stringify(metadata).slice(0,80000),stamp,stamp,
      ],
    );
    return { ok: true, id, name, version, capabilities, permissions, surfaces, state: 'online', last_seen_at: stamp };
  }

  async heartbeat(id, payload = {}) {
    const key = productId(id);
    if (!key) throw new Error('product id requis');
    const existing = await one('SELECT id,name,version,repository,endpoint,capabilities,permissions,surfaces,metadata FROM aura_products WHERE id=?',[key]);
    if (!existing) return this.register({ id:key, name: payload.name || key, ...payload });
    return this.register({
      id:key,
      name:payload.name || existing.name,
      version:payload.version || existing.version,
      repository:payload.repository || existing.repository,
      endpoint:payload.endpoint || existing.endpoint,
      capabilities:payload.capabilities || json(existing.capabilities,[]),
      permissions:payload.permissions || json(existing.permissions,[]),
      surfaces:payload.surfaces || json(existing.surfaces,[]),
      metadata:{ ...json(existing.metadata,{}), ...(payload.metadata || {}) },
      instance_id:payload.instance_id || payload.instanceId || 'default',
    });
  }

  async list() {
    const rows = await query('SELECT * FROM aura_products ORDER BY name ASC');
    const stamp = nowMs();
    return rows.map((row) => ({
      ...row,
      capabilities: json(row.capabilities, []),
      permissions: json(row.permissions, []),
      surfaces: json(row.surfaces, []),
      metadata: json(row.metadata, {}),
      last_seen_ms: Number(row.last_seen_ms || 0),
      state: stamp - Number(row.last_seen_ms || 0) > this.offlineMs ? 'offline' : String(row.state || 'unknown'),
    }));
  }

  async capabilities() {
    const products = await this.list();
    const map = {};
    for (const product of products) {
      for (const capability of product.capabilities) {
        if (!map[capability]) map[capability] = [];
        map[capability].push({ id:product.id, name:product.name, state:product.state, version:product.version });
      }
    }
    return map;
  }

  async status() {
    const products = await this.list();
    return {
      version: ProductRegistry.VERSION,
      total: products.length,
      online: products.filter((item) => item.state === 'online').length,
      products,
      capabilities: await this.capabilities(),
    };
  }
}
