import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class FileCapabilityMemory {
  constructor(filePath) {
    this.filePath = path.resolve(String(filePath || ''));
    if (!filePath) throw new Error('capability memory file path required');
  }

  async readState() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      if (error?.code === 'ENOENT') return {};
      throw error;
    }
  }

  async load(limit = 256) {
    const state = await this.readState();
    return Object.values(state)
      .filter((item) => item && typeof item === 'object')
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
      .slice(0, Math.max(1, Number(limit) || 256))
      .map((item) => ({ manifest: JSON.stringify(item.manifest || item) }));
  }

  async save(capability) {
    const state = await this.readState();
    const stamp = new Date().toISOString();
    state[String(capability.id)] = {
      manifest: { ...capability },
      updated_at: stamp,
    };
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temp = this.filePath + '.tmp-' + process.pid;
    await writeFile(temp, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
    await rename(temp, this.filePath);
    return { id: capability.id, updated_at: stamp };
  }
}
