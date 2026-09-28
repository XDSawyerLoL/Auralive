import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

const datasetRoot = path.resolve(arg('--dataset', 'external/ARC-AGI-2/data/evaluation'));
const auraRoot = path.resolve(arg('--aura-root', 'frozen-aura'));
const outFile = path.resolve(arg('--out', 'artifacts/external/arc-agi-2-public.json'));
const frozenSha = process.env.AURA_FROZEN_SHA || '';
const datasetSha = process.env.ARC_AGI2_SHA || '';

const solverPath = path.join(auraRoot, 'cloud-node', 'src', 'grid_reasoning.js');
const solver = await import(pathToFileURL(solverPath).href);
const { induceGridProgram, applyGridProgram, gridEquals } = solver;

const names = (await fs.readdir(datasetRoot))
  .filter((name) => name.endsWith('.json'))
  .sort();

const rows = [];
let solvedTasks = 0;
let solvedInputs = 0;
let totalInputs = 0;

for (const name of names) {
  const task = JSON.parse(await fs.readFile(path.join(datasetRoot, name), 'utf8'));
  const induction = induceGridProgram(task.train || []);
  const candidates = (induction?.candidates || []).slice(0, 2);
  const tests = Array.isArray(task.test) ? task.test : [];
  let taskCorrect = tests.length > 0;
  const details = [];

  for (const item of tests) {
    totalInputs += 1;
    const attempts = [];
    for (const candidate of candidates) {
      try {
        attempts.push(applyGridProgram(candidate.name, item.input, candidate.params || {}));
      } catch {
        attempts.push(null);
      }
    }
    while (attempts.length < 2) attempts.push(null);
    const correct = attempts.some((output) => output && gridEquals(output, item.output));
    if (correct) solvedInputs += 1;
    if (!correct) taskCorrect = false;
    details.push({
      correct,
      attempts: attempts.map((output) => output || []),
    });
  }

  if (taskCorrect) solvedTasks += 1;
  rows.push({
    task: name.replace(/\.json$/i, ''),
    solved: taskCorrect,
    inferred: Boolean(induction?.solved),
    primary_program: induction?.program?.name || '',
    candidate_programs: candidates.map((candidate) => candidate.name),
    test_inputs: tests.length,
    solved_inputs: details.filter((item) => item.correct).length,
  });
}

const report = {
  schema: 'aura-arc-agi-2-public-eval-v1',
  generated_at: new Date().toISOString(),
  frozen_aura_sha: frozenSha,
  arc_agi_2_sha: datasetSha,
  solver: 'cloud-node/src/grid_reasoning.js',
  trial_policy: {
    max_predictions_per_test_input: 2,
    note: 'Uses at most the first two programs consistent with training examples.',
  },
  summary: {
    tasks: names.length,
    solved_tasks: solvedTasks,
    task_accuracy: names.length ? solvedTasks / names.length : 0,
    test_inputs: totalInputs,
    solved_test_inputs: solvedInputs,
    test_input_accuracy: totalInputs ? solvedInputs / totalInputs : 0,
  },
  results: rows,
};

await fs.mkdir(path.dirname(outFile), { recursive: true });
await fs.writeFile(outFile, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log('ARC-AGI-2 public evaluation');
console.log('Frozen AURA:', frozenSha || '(unspecified)');
console.log('Dataset:', datasetSha || '(unspecified)');
console.log('Tasks:', report.summary.tasks);
console.log('Solved tasks:', report.summary.solved_tasks);
console.log('Task accuracy:', (report.summary.task_accuracy * 100).toFixed(2) + '%');
console.log('Solved test inputs:', report.summary.solved_test_inputs + '/' + report.summary.test_inputs);
console.log('Test-input accuracy:', (report.summary.test_input_accuracy * 100).toFixed(2) + '%');
console.log('Report:', outFile);
