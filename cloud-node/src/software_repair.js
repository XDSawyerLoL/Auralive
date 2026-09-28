import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const digest = (value) => createHash('sha256').update(String(value || '')).digest('hex');

function replaceAt(source, start, end, replacement) {
  return source.slice(0, start) + replacement + source.slice(end);
}

function uniqueCandidates(rows, original, maxCandidates) {
  const seen = new Set([original]);
  const out = [];
  for (const row of rows) {
    if (!row?.source || seen.has(row.source)) continue;
    seen.add(row.source);
    out.push(row);
    if (out.length >= maxCandidates) break;
  }
  return out;
}

export function generateRepairCandidates(source, { maxCandidates = 160 } = {}) {
  const rows = [];
  const operatorAlternatives = new Map([
    ['+', ['-', '*', '/']],
    ['-', ['+', '*', '/']],
    ['*', ['+', '-', '/']],
    ['/', ['*', '+', '-']],
    ['>', ['>=', '<', '<=']],
    ['>=', ['>', '<=', '<']],
    ['<', ['<=', '>', '>=']],
    ['<=', ['<', '>=', '>']],
    ['===', ['!==']],
    ['!==', ['===']],
    ['==', ['!=']],
    ['!=', ['==']],
    ['&&', ['||']],
    ['||', ['&&']],
  ]);

  const operatorRegex = /===|!==|==|!=|>=|<=|&&|\|\||[+\-*/<>]/g;
  let match;
  while ((match = operatorRegex.exec(source)) !== null) {
    const alternatives = operatorAlternatives.get(match[0]) || [];
    for (const replacement of alternatives) {
      rows.push({
        kind: 'operator-substitution',
        detail: match[0] + '->' + replacement,
        source: replaceAt(source, match.index, match.index + match[0].length, replacement),
      });
    }
  }

  const numberRegex = /\b\d+\b/g;
  while ((match = numberRegex.exec(source)) !== null) {
    const value = Number(match[0]);
    if (!Number.isFinite(value)) continue;
    for (const next of [value - 1, value + 1]) {
      if (next < 0) continue;
      rows.push({
        kind: 'numeric-boundary',
        detail: String(value) + '->' + String(next),
        source: replaceAt(source, match.index, match.index + match[0].length, String(next)),
      });
    }
  }

  const booleanRegex = /\b(true|false)\b/g;
  while ((match = booleanRegex.exec(source)) !== null) {
    const replacement = match[0] === 'true' ? 'false' : 'true';
    rows.push({
      kind: 'boolean-flip',
      detail: match[0] + '->' + replacement,
      source: replaceAt(source, match.index, match.index + match[0].length, replacement),
    });
  }

  return uniqueCandidates(rows, source, Math.max(1, Number(maxCandidates) || 160));
}

export class SoftwareRepairEngine {
  constructor({ workspaceRoot, timeoutMs = 5000, maxCandidates = 160 } = {}) {
    if (!workspaceRoot) throw new Error('software repair workspace root required');
    this.root = path.resolve(String(workspaceRoot));
    this.timeoutMs = Math.max(500, Math.min(Number(timeoutMs) || 5000, 30000));
    this.maxCandidates = Math.max(1, Math.min(Number(maxCandidates) || 160, 500));
  }

  safePath(relativePath) {
    const raw = String(relativePath || '').trim();
    if (!raw || path.isAbsolute(raw) || raw.includes('\0')) {
      throw new Error('repair path invalid');
    }
    const resolved = path.resolve(this.root, raw);
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new Error('repair path escapes workspace');
    }
    return resolved;
  }

  async validate(testFile) {
    const testPath = this.safePath(testFile);
    return new Promise((resolve) => {
      const child = spawn(process.execPath, ['--test', testPath], {
        cwd: this.root,
        shell: false,
        windowsHide: true,
        env: {
          ...process.env,
          NODE_ENV: 'test',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (payload) => {
        if (settled) return;
        settled = true;
        resolve(payload);
      };
      child.stdout.on('data', (chunk) => {
        stdout = (stdout + chunk.toString()).slice(-16000);
      });
      child.stderr.on('data', (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-16000);
      });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish({ pass: false, exit_code: null, timeout: true, stdout, stderr });
      }, this.timeoutMs);
      child.on('error', (error) => {
        clearTimeout(timer);
        finish({
          pass: false,
          exit_code: null,
          timeout: false,
          stdout,
          stderr: (stderr + '\n' + String(error?.message || error)).slice(-16000),
        });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        finish({
          pass: code === 0,
          exit_code: code,
          timeout: false,
          stdout,
          stderr,
        });
      });
    });
  }

  async repair({ sourceFile, testFile } = {}) {
    const sourcePath = this.safePath(sourceFile);
    this.safePath(testFile);
    const original = await readFile(sourcePath, 'utf8');
    const originalHash = digest(original);
    const baseline = await this.validate(testFile);
    if (baseline.pass) {
      return {
        repaired: false,
        reason: 'baseline-already-passing',
        attempts: 0,
        original_sha256: originalHash,
        final_sha256: originalHash,
        baseline,
      };
    }

    const candidates = generateRepairCandidates(original, {
      maxCandidates: this.maxCandidates,
    });
    let attempts = 0;
    for (const candidate of candidates) {
      attempts += 1;
      await writeFile(sourcePath, candidate.source, 'utf8');
      const first = await this.validate(testFile);
      if (!first.pass) continue;
      const confirmation = await this.validate(testFile);
      if (!confirmation.pass) continue;
      return {
        repaired: true,
        attempts,
        candidate_kind: candidate.kind,
        candidate_detail: candidate.detail,
        original_sha256: originalHash,
        final_sha256: digest(candidate.source),
        baseline,
        validation: first,
        confirmation,
      };
    }

    await writeFile(sourcePath, original, 'utf8');
    return {
      repaired: false,
      reason: 'no-regression-free-candidate-found',
      attempts,
      original_sha256: originalHash,
      final_sha256: originalHash,
      baseline,
    };
  }
}
