import { writeFile } from 'node:fs/promises';
import { runAgiBattery } from '../src/agi_benchmark.js';

const report = await runAgiBattery();
const rows = report.cases.map((item) => ({
  id: item.id,
  domain: item.domain,
  status: item.status,
  title: item.title,
  evidence: item.evidence,
}));

const symbol = {
  pass: 'PASS',
  fail: 'FAIL',
  gap: 'GAP',
  unverified: 'UNVERIFIED',
};

console.log('');
console.log('AURA AGI BATTERY v1');
console.log('===================');
for (const row of rows) {
  console.log(`${symbol[row.status] || row.status.toUpperCase()}  ${row.id}  [${row.domain}]  ${row.title}`);
  console.log(`      ${row.evidence}`);
}
console.log('');
console.log(
  `Summary: pass=${report.counts.pass} fail=${report.counts.fail} gap=${report.counts.gap} unverified=${report.counts.unverified}`,
);
console.log(`AGI demonstrated: ${report.agi_demonstrated ? 'YES' : 'NO'}`);
console.log(`Reason: ${report.agi_claim_reason}`);

const jsonArg = process.argv.find((arg) => arg.startsWith('--json='));
if (jsonArg) {
  const path = jsonArg.slice('--json='.length).trim();
  if (path) {
    await writeFile(path, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`JSON report: ${path}`);
  }
}

if (!report.deterministic_regression_free) {
  process.exitCode = 1;
}
