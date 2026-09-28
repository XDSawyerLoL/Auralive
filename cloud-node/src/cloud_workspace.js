import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MAX_BYTES = 64 * 1024;

function digest(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function nestedPath(value) {
  if (!value || typeof value !== 'object') return '';
  if (typeof value.path === 'string') return value.path;
  for (const item of Object.values(value)) {
    const found = nestedPath(item);
    if (found) return found;
  }
  return '';
}

export class AuraCloudWorkspace {
  static VERSION = 'aura-cloud-workspace-v1';

  constructor(root = '') {
    const isolatedRoot = String(root || '').trim() || path.join(
      tmpdir(),
      `aura-cloud-workspace-${process.pid}-${randomUUID()}`,
    );
    this.root = path.resolve(isolatedRoot);
  }

  safePath(relativeName) {
    const raw = String(relativeName || '').trim().replace(/\\/g, '/');
    if (!raw || raw.includes('\0') || path.isAbsolute(raw)) {
      throw new Error('chemin workspace invalide');
    }
    const normalized = path.posix.normalize(raw);
    if (normalized === '..' || normalized.startsWith('../')) {
      throw new Error('sortie du workspace interdite');
    }
    const resolved = path.resolve(this.root, normalized);
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new Error('sortie du workspace interdite');
    }
    return resolved;
  }

  async ensureRoot() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
  }

  filenameForObjective(objective) {
    return 'task-' + digest(objective || 'aura-workspace').slice(0, 20) + '.txt';
  }

  async create(input = {}) {
    await this.ensureRoot();
    const objective = String(input.objective || 'AURA cloud workspace task').slice(0, 4000);
    const relative = this.filenameForObjective(objective);
    const full = this.safePath(relative);
    const content = 'AURA_WORKSPACE:' + digest(objective).slice(0, 32);
    await writeFile(full, content, { encoding: 'utf8', mode: 0o600, flag: 'w' });
    return {
      path: relative,
      bytes: Buffer.byteLength(content),
      sha256: digest(content),
      created: true,
    };
  }

  async read(input = {}) {
    await this.ensureRoot();
    const relative = String(input.path || nestedPath(input.dependencies) || '').trim();
    const full = this.safePath(relative);
    const info = await stat(full);
    if (!info.isFile()) throw new Error('objet workspace non-fichier');
    if (info.size > MAX_BYTES) throw new Error('fichier workspace trop volumineux');
    const content = await readFile(full, 'utf8');
    return {
      path: relative,
      bytes: Buffer.byteLength(content),
      sha256: digest(content),
      content,
      read: true,
    };
  }

  async remove(input = {}) {
    await this.ensureRoot();
    const relative = String(input.path || nestedPath(input.dependencies) || '').trim();
    const full = this.safePath(relative);
    await unlink(full);
    let exists = true;
    try { await stat(full); } catch { exists = false; }
    if (exists) throw new Error('suppression workspace non confirmée');
    return {
      path: relative,
      deleted: true,
      exists_after: false,
    };
  }
}
