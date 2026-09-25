import { createHash, verify as cryptoVerify } from 'node:crypto';

import { config } from './config.js';
import { query } from './db.js';

const clean = (value, limit = 4000) =>
  String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) =>
    JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
}

function normalizedManifest(raw = {}) {
  return {
    id: clean(raw.id, 180),
    version: clean(raw.version || '1', 80),
    sha256: clean(raw.sha256, 64).toLowerCase(),
    signer_key_id: clean(raw.signer_key_id, 120),
    allowed_imports: [...new Set(
      (Array.isArray(raw.allowed_imports) ? raw.allowed_imports : [])
        .map((item) => clean(item, 240))
        .filter(Boolean),
    )].sort(),
    max_memory_pages: Math.max(0, Math.min(Number(raw.max_memory_pages || 0), 65536)),
    max_fuel: Math.max(0, Number(raw.max_fuel || 0)),
    deterministic: raw.deterministic !== false,
    side_effects: Boolean(raw.side_effects),
    input_contract: raw.input_contract && typeof raw.input_contract === 'object'
      ? raw.input_contract
      : {},
    output_contract: raw.output_contract && typeof raw.output_contract === 'object'
      ? raw.output_contract
      : {},
  };
}

function signaturePayload(manifest) {
  return Buffer.from(stableJson(normalizedManifest(manifest)), 'utf8');
}

function decodeSignature(value) {
  const raw = String(value || '').trim();
  if (!raw) return Buffer.alloc(0);
  try {
    return Buffer.from(raw, 'base64url');
  } catch {
    return Buffer.from(raw, 'base64');
  }
}

export function kernelHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export class SignedWasmKernelRegistry {
  static VERSION = 'aura-signed-wasm-kernels-v1';

  constructor() {
    this.lastError = '';
    this.lastVerifiedAt = '';
  }

  signer(keyId) {
    const record = config.wasmSignerKeys?.[String(keyId || '')];
    if (!record) return null;
    return typeof record === 'string' ? record : record.public_key || record.pem || '';
  }

  async inspect(bytes, manifest = {}) {
    if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes || []);
    if (!bytes.length) throw new Error('kernel Wasm vide');
    if (bytes.length > config.wasmKernelMaxBytes) {
      throw new Error(`kernel Wasm trop volumineux: ${bytes.length}/${config.wasmKernelMaxBytes}`);
    }
    if (!WebAssembly.validate(bytes)) throw new Error('module Wasm invalide');

    const normalized = normalizedManifest(manifest);
    if (!normalized.id) throw new Error('id kernel manquant');
    const sha256 = kernelHash(bytes);
    if (normalized.sha256 && normalized.sha256 !== sha256) {
      throw new Error('hash kernel différent du manifeste');
    }
    normalized.sha256 = sha256;

    const module = await WebAssembly.compile(bytes);
    const imports = WebAssembly.Module.imports(module)
      .map((item) => `${item.module}:${item.name}`)
      .sort();
    const allowed = new Set(normalized.allowed_imports);
    const forbidden = imports.filter((item) => !allowed.has(item));
    if (forbidden.length) {
      throw new Error('imports Wasm non autorisés: ' + forbidden.join(', '));
    }

    if (normalized.side_effects) {
      throw new Error('un kernel Edge AURA signé ne peut pas déclarer des effets de bord');
    }

    return {
      manifest: normalized,
      bytes: bytes.length,
      imports,
      forbidden_imports: forbidden,
    };
  }

  async verify(bytes, manifest = {}, signature = '') {
    const inspected = await this.inspect(bytes, manifest);
    const signer = this.signer(inspected.manifest.signer_key_id);
    if (!signer) throw new Error('signataire Wasm inconnu');
    const sig = decodeSignature(signature);
    if (!sig.length) throw new Error('signature Wasm absente');

    const ok = cryptoVerify(
      null,
      signaturePayload(inspected.manifest),
      signer,
      sig,
    );
    if (!ok) throw new Error('signature Wasm invalide');
    this.lastVerifiedAt = new Date().toISOString();
    this.lastError = '';
    return { ...inspected, signature_valid: true };
  }

  async register(bytes, manifest = {}, signature = '', {
    origin = 'manual',
    artifactUrl = '',
  } = {}) {
    try {
      const verified = await this.verify(bytes, manifest, signature);
      const stamp = new Date().toISOString();
      await query(
        `INSERT INTO aura_wasm_kernels(
          id,version,sha256,signer_key_id,manifest,signature,artifact_url,
          origin,status,verified_at,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?, 'verified',?,?,?)
        ON DUPLICATE KEY UPDATE
          version=VALUES(version),
          sha256=VALUES(sha256),
          signer_key_id=VALUES(signer_key_id),
          manifest=VALUES(manifest),
          signature=VALUES(signature),
          artifact_url=VALUES(artifact_url),
          origin=VALUES(origin),
          status='verified',
          verified_at=VALUES(verified_at),
          updated_at=VALUES(updated_at)`,
        [
          verified.manifest.id,
          verified.manifest.version,
          verified.manifest.sha256,
          verified.manifest.signer_key_id,
          JSON.stringify(verified.manifest).slice(0, 50000),
          clean(signature, 4000),
          clean(artifactUrl, 1800),
          clean(origin, 120),
          stamp,
          stamp,
          stamp,
        ],
      );
      return {
        ok: true,
        id: verified.manifest.id,
        version: verified.manifest.version,
        sha256: verified.manifest.sha256,
        imports: verified.imports,
        signature_valid: true,
      };
    } catch (error) {
      this.lastError = String(error?.message || error).slice(0, 1000);
      throw error;
    }
  }

  async list(limit = 100) {
    return query(
      `SELECT id,version,sha256,signer_key_id,artifact_url,origin,status,verified_at,updated_at
       FROM aura_wasm_kernels
       ORDER BY updated_at DESC LIMIT ?`,
      [Math.max(1, Math.min(Number(limit || 100), 500))],
    );
  }

  status() {
    return {
      version: SignedWasmKernelRegistry.VERSION,
      configured_signers: Object.keys(config.wasmSignerKeys || {}).length,
      max_kernel_bytes: config.wasmKernelMaxBytes,
      signed_only: true,
      remote_side_effects: false,
      last_verified_at: this.lastVerifiedAt,
      last_error: this.lastError,
    };
  }
}
