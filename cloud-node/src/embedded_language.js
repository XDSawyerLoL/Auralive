import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, chmod, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const VERSION = 'b11425';
const CPU_RELEASE = 'https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/' + VERSION;
const MODEL = 'Qwen/Qwen3-0.6B-GGUF:Q8_0';
const MAX_ARCHIVE_BYTES = 220 * 1024 * 1024;
const MIN_RAM_BYTES = 1750 * 1024 * 1024;
const PORT = 18080;

function guardPath(value) {
  const directory = String(value || '').trim();
  if (!directory || !resolve(directory).startsWith('/')) throw new Error('embedded-invalid-cache-dir');
  return directory;
}

// Linux's per-mount noexec overrides chmod(0700). Resolve the longest matching
// mount so a noexec /tmp is never mistaken for a writable executable cache.
export function mountIsNoexec(directory, mountinfo = '') {
  const candidate = resolve(String(directory || '/'));
  let bestLength = -1;
  let noexec = false;
  for (const line of String(mountinfo || '').split('\n')) {
    const fields = line.split(' - ')[0].split(' ');
    if (fields.length < 6) continue;
    const mountPath = fields[4]
      .replace(/\\040/g, ' ').replace(/\\011/g, '\t')
      .replace(/\\012/g, '\n').replace(/\\134/g, '\\');
    if (candidate !== mountPath && !candidate.startsWith(mountPath === '/' ? '/' : mountPath + '/')) continue;
    if (mountPath.length <= bestLength) continue;
    bestLength = mountPath.length;
    noexec = fields[5].split(',').includes('noexec');
  }
  return bestLength >= 0 ? noexec : null;
}

async function isNoexec(directory) {
  try { return mountIsNoexec(directory, await readFile('/proc/self/mountinfo', 'utf8')); }
  catch { return null; }
}

export function embeddedCacheCandidates({ explicit = '', cwd = process.cwd(), home = homedir(), temporary = tmpdir() } = {}) {
  if (explicit) return [guardPath(explicit)];
  return [...new Set([
    join(cwd, '.aura-language-runtime'),
    join(home, '.cache', 'aura-language-runtime'),
    join(temporary, 'aura-embedded-language'),
  ].map(guardPath))];
}

async function memoryLimitBytes() {
  for (const path of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    try {
      const raw = (await readFile(path, 'utf8')).trim();
      if (/^\d+$/.test(raw)) {
        const n = Number(raw);
        if (n > 0 && n < Number.MAX_SAFE_INTEGER / 2) return n;
      }
    } catch {}
  }
  return null; // Hostinger may enforce limits without publishing cgroup quota.
}

export function embeddedSupported(platform = process.platform, arch = process.arch) {
  return platform === 'linux' && ['x64', 'arm64'].includes(arch);
}

function safeError(error) {
  return String(error?.message || error || 'Erreur inconnue')
    .replace(/Bearer\s+\S+/ig, 'Bearer [REDACTED]').replace(/\s+/g, ' ').slice(0, 320);
}

async function spawnDone(command, args, cwd) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (buf) => { stderr = (stderr + String(buf)).slice(-500); });
    child.once('error', fail);
    child.once('close', (code) => code === 0 ? done() : fail(new Error(command + ' exited ' + code + ': ' + stderr)));
  });
}

async function findBinary(dir, depth = 0) {
  if (depth > 4) return '';
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const dest = join(dir, entry.name);
    if (entry.isFile() && entry.name === 'llama-server') return dest;
    if (entry.isDirectory()) {
      const nested = await findBinary(dest, depth + 1);
      if (nested) return nested;
    }
  }
  return '';
}

async function downloadChecked(url, destination, expectedSha256) {
  const response = await fetch(url, { signal: AbortSignal.timeout(90000), redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error('embedded-download-http-' + response.status);
  if (!['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(new URL(response.url).hostname)) {
    throw new Error('embedded-untrusted-download-host');
  }
  const hash = createHash('sha256');
  let bytes = 0;
  const guard = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_ARCHIVE_BYTES) return callback(new Error('embedded-binary-archive-too-large'));
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), guard, createWriteStream(destination, { flags: 'wx' }));
  if (hash.digest('hex').toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error('embedded-binary-sha256-mismatch');
  }
}

export class EmbeddedLanguage {
  constructor({
    enabled = false,
    baseUrl = 'http://127.0.0.1:' + PORT,
    cacheDir = process.env.AURA_EMBEDDED_CACHE_DIR || '',
  } = {}) {
    this.enabled = Boolean(enabled);
    this.baseUrl = baseUrl;
    this.cacheDir = cacheDir;
    this.requestedCacheDir = cacheDir;
    this.executionAttempts = [];
    this.retryAfterMs = 0;
    this.stage = this.enabled ? 'pending' : 'disabled';
    this.error = '';
    this.startedAt = '';
    this.readyAt = '';
    this.worker = null;
    this.bootPromise = null;
  }

  snapshot() {
    return {
      enabled: this.enabled,
      stage: this.stage,
      error: this.error,
      started_at: this.startedAt,
      ready_at: this.readyAt,
      download_only_public_weights: true,
      serving: this.baseUrl,
      external_inference: false,
      cache_location: this.cacheDir ? (this.cacheDir.startsWith(tmpdir()) ? 'temporary' : 'persistent') : 'not-selected',
      execution_attempts: this.executionAttempts.slice(-5),
      retry_after: this.retryAfterMs > Date.now() ? new Date(this.retryAfterMs).toISOString() : null,
    };
  }

  async start() {
    if (!this.enabled) return false;
    if (this.stage === 'ready') return true;
    if (this.stage === 'unavailable' && Date.now() < this.retryAfterMs) return false;
    if (this.bootPromise) return this.bootPromise;
    this.startedAt = new Date().toISOString();
    this.bootPromise = this.#boot().catch((error) => {
      this.error = safeError(error);
      this.stage = 'unavailable';
      this.retryAfterMs = Date.now() + 20 * 60 * 1000;
      return false;
    }).finally(() => { this.bootPromise = null; });
    return this.bootPromise;
  }

  async #boot() {
    if (!embeddedSupported()) throw new Error('embedded-platform-not-supported; requires Linux x64/arm64');
    const memory = await memoryLimitBytes();
    if (memory != null && memory < MIN_RAM_BYTES) throw new Error('embedded-insufficient-ram: at least 1.75GiB for the model');
    this.executionAttempts = [];
    const candidates = embeddedCacheCandidates({ explicit: this.requestedCacheDir });
    for (const [index, candidate] of candidates.entries()) {
      const label = index === 0 ? 'application' : index === 1 ? 'home' : 'temporary';
      const mountedNoexec = await isNoexec(candidate);
      if (mountedNoexec === true) {
        this.executionAttempts.push(label + ':noexec');
        continue;
      }
      this.cacheDir = candidate;
      try {
        this.stage = 'preparing-local-executable';
        const success = await this.#bootInCache();
        return success;
      } catch (error) {
        const problem = String(error?.message || error || '');
        const blocked = /\b(?:EACCES|EPERM|EROFS|permission denied|spawn .*eacces)\b/i.test(problem);
        if (!blocked) throw error;
        this.executionAttempts.push(label + ':execution-denied');
        if (this.worker?.exitCode === null) this.worker.kill('SIGTERM');
        this.worker = null;
      }
    }
    throw new Error('embedded-execution-denied: all allowed cache locations are noexec, read-only or EACCES; '
      + this.executionAttempts.join(', ') + '. Hostinger requires an in-process WASM inference backend.');
  }

  async #bootInCache() {
    await mkdir(this.cacheDir, { recursive: true, mode: 0o700 });
    const binDir = join(this.cacheDir, 'llama-' + VERSION);
    await mkdir(binDir, { recursive: true, mode: 0o700 });
    let binary = await findBinary(binDir);
    if (!binary) {
      this.stage = 'downloading-engine';
      const api = await fetch(CPU_RELEASE, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'AURA-local-language' },
        signal: AbortSignal.timeout(18000),
      });
      if (!api.ok) throw new Error('embedded-github-release-http-' + api.status);
      const metadata = await api.json();
      const filename = 'llama-' + VERSION + '-bin-ubuntu-' + (process.arch === 'x64' ? 'x64' : 'arm64') + '.tar.gz';
      const asset = (metadata.assets || []).find((item) => item.name === filename);
      if (!asset?.browser_download_url || !asset.browser_download_url.startsWith('https://github.com/ggml-org/llama.cpp/releases/download/' + VERSION + '/')) {
        throw new Error('embedded-release-asset-missing');
      }
      const digest = String(asset.digest || '').match(/^sha256:([0-9a-f]{64})$/i);
      if (!digest) throw new Error('embedded-release-no-sha256-attestation');
      const archive = join(this.cacheDir, filename + '.partial-' + process.pid);
      try {
        await downloadChecked(asset.browser_download_url, archive, digest[1]);
        this.stage = 'installing-engine';
        await spawnDone('tar', ['-xzf', archive, '-C', binDir, '--no-same-owner', '--no-same-permissions'], this.cacheDir);
      } finally {
        await rm(archive, { force: true }).catch(() => {});
      }
      binary = await findBinary(binDir);
    }
    if (!binary) throw new Error('embedded-llama-server-not-found');
    await chmod(binary, 0o700);
    this.stage = 'loading-model';
    const child = spawn(binary, [
      '--host', '127.0.0.1', '--port', String(PORT), '--alias', 'aura-fr',
      '--threads', '2', '-c', '1024', '--parallel', '1', '-hf', MODEL,
    ], {
      cwd: this.cacheDir,
      env: { ...process.env, LLAMA_CACHE: join(this.cacheDir, 'models') },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    this.worker = child;
    let errTail = '';
    child.stderr?.on('data', (buffer) => { errTail = (errTail + buffer.toString()).slice(-480); });
    child.once('error', (error) => {
      this.error = safeError(error);
      this.stage = 'unavailable';
    });
    child.once('exit', (code) => {
      if (this.worker === child) {
        this.worker = null;
        if (this.stage !== 'disabled') {
          this.stage = 'unavailable';
          this.error = 'embedded-engine-exited-' + code + ': ' + errTail.slice(-180);
        }
      }
    });
    const started = Date.now();
    while (Date.now() - started < 240000) {
      if (child.exitCode != null || !this.worker) throw new Error(this.error || 'embedded-engine-exited');
      try {
        const probe = await fetch(this.baseUrl + '/health', { signal: AbortSignal.timeout(1500) });
        if (probe.ok) {
          const status = await probe.json().catch(() => ({}));
          if (status.status === 'ok' || status.status === 'ready') {
            this.stage = 'ready';
            this.readyAt = new Date().toISOString();
            return true;
          }
        }
      } catch {}
      await new Promise((finish) => setTimeout(finish, 1500));
    }
    this.stop();
    throw new Error('embedded-model-load-timeout; verify memory, model-download access and execution permission');
  }

  stop() {
    this.enabled = false;
    this.stage = 'disabled';
    const child = this.worker;
    this.worker = null;
    if (child && child.exitCode === null) child.kill('SIGTERM');
  }
}
