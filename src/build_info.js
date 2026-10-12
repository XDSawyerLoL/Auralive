import { readFileSync } from 'node:fs';

function readJson(url) {
  try {
    return JSON.parse(readFileSync(url, 'utf8'));
  } catch {
    return {};
  }
}

const pkg = readJson(new URL('../package.json', import.meta.url));
const deployment = readJson(new URL('../DEPLOYMENT.json', import.meta.url));

function clean(value, limit = 300) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function buildInfo() {
  const gitSha = clean(
    process.env.AURA_GIT_SHA
    || process.env.GITHUB_SHA
    || deployment.git_sha
    || '',
    64,
  );
  const builtAt = clean(
    process.env.AURA_BUILD_TIME
    || deployment.built_at
    || deployment.created_at
    || '',
    80,
  );
  return {
    product: 'AURA Cloud',
    version: clean(pkg.version || deployment.version || 'unknown', 80),
    git_sha: gitSha,
    git_sha_short: gitSha ? gitSha.slice(0, 12) : '',
    built_at: builtAt,
    runtime: 'Node.js/Fastify',
    node: process.version,
    canonical_source: clean(deployment.canonical_source || 'cloud-node', 120),
    deployment_target: clean(deployment.target || process.env.AURA_DEPLOYMENT_TARGET || 'runtime', 160),
    provenance_verified: Boolean(gitSha),
  };
}

export function buildMatches(expectedSha = '') {
  const expected = clean(expectedSha, 64).toLowerCase();
  const actual = buildInfo().git_sha.toLowerCase();
  if (!expected) return { checked: false, match: null, expected: '', actual };
  const match = Boolean(actual && (actual === expected || actual.startsWith(expected) || expected.startsWith(actual)));
  return { checked: true, match, expected, actual };
}
