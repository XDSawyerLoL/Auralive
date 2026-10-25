// Zero-network evidence regression test. No npm packages or LLM API required.
import { classifyInitiativeResult } from '../../cloud-node/src/outcome_truth.js';
import { cases } from './fixtures.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export function evaluateBrowserReport(report) {
  if (!report || !Array.isArray(report.checks) || !report.checks.length)
    return { ok: false, reason: 'missing-browser-checks', passed: 0, total: 0 };
  const root = path.resolve(String(report.artifacts_directory || ''));
  const observed = [];
  for (const check of report.checks) {
    const filepath = path.resolve(String(check.screenshot_file || ''));
    const pathAllowed = filepath.startsWith(root + path.sep);
    let digestMatches = false;
    if (pathAllowed && fs.existsSync(filepath) && fs.statSync(filepath).isFile()) {
      const bytes = fs.readFileSync(filepath);
      digestMatches = createHash('sha256').update(bytes).digest('hex') === check.screenshot_sha256;
    }
    const valid = check.ok === true && digestMatches
      && Number(check.http_status) >= 200 && Number(check.http_status) < 400
      && check.final_url === 'https://swapp.tv' + check.route
      && String(check.title || '').trim().length > 0 && (!check.errors || check.errors.length === 0);
    observed.push({ route: check.route, viewport: check.viewport, passed: valid, sha_verified: digestMatches });
  }
  const passed = observed.filter(row => row.passed).length;
  return { ok: passed === observed.length, passed, total: observed.length, checks: observed };
}

export function evaluateCases() {
  const rows = cases.map(entry => {
    const actual = classifyInitiativeResult(entry.kind, entry.result);
    return { id: entry.id, expected: entry.expected, actual: actual.status, passed: actual.status === entry.expected };
  });
  return { ok: rows.every(row => row.passed), passed: rows.filter(row => row.passed).length, total: rows.length, cases: rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const outcome = evaluateCases();
  const reportPath = process.argv[2] || '';
  let browser = null;
  if (reportPath) {
    try {
      browser = evaluateBrowserReport(JSON.parse(fs.readFileSync(reportPath, 'utf8')));
    } catch (error) {
      browser = { ok: false, reason: String(error?.message || error).slice(0, 180) };
    }
  }
  console.log(JSON.stringify({ outcome, browser, zero_cost: true }, null, 2));
  if (!outcome.ok || (browser && !browser.ok)) process.exitCode = 1;
}
