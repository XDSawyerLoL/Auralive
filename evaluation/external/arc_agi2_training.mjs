
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

function bucket(taskId) {
  return parseInt(taskId.slice(0, 2), 16) % 5;
}

const datasetRoot = path.resolve(arg('--dataset', 'external/ARC-AGI-2/data/training'));
const auraRoot = path.resolve(arg('--aura-root', '.'));
const outFile = path.resolve(arg('--out', 'artifacts/external/arc-agi-2-training-dev.json'));
const split = arg('--split', 'dev');
const solverPath = path.join(auraRoot, 'cloud-node', 'src', 'grid_reasoning.js');
const solver = await import(pathToFileURL(solverPath).href);
const { induceGridProgram, applyGridProgram, gridEquals } = solver;

const allNames = (await fs.readdir(datasetRoot)).filter((name) => name.endsWith('.json')).sort();
const names = allNames.filter((name) => {
  if (split === 'all') return true;
  const held = bucket(name.replace(/\.json$/i, '')) === 0;
  return split === 'holdout' ? held : !held;
});

let solvedTasks = 0;
let inferredTasks = 0;
let solvedInputs = 0;
let totalInputs = 0;
const byProgram = {};
const results = [];

for (const name of names) {
  const task = JSON.parse(await fs.readFile(path.join(datasetRoot, name), 'utf8'));
  const induction = induceGridProgram(task.train || []);
  if (induction.solved) inferredTasks += 1;
  const candidates = (induction.candidates || []).slice(0, 2);
  let taskCorrect = (task.test || []).length > 0;
  let taskSolvedInputs = 0;

  for (const item of task.test || []) {
    totalInputs += 1;
    const attempts = candidates.map((candidate) => {
      try {
        return applyGridProgram(candidate.name, item.input, candidate.params || {});
      } catch {
        return null;
      }
    });
    const correct = attempts.some((output) => output && gridEquals(output, item.output));
    if (correct) {
      solvedInputs += 1;
      taskSolvedInputs += 1;
    } else {
      taskCorrect = false;
    }
  }

  if (taskCorrect) {
    solvedTasks += 1;
    const key = induction.program?.name || 'unknown';
    byProgram[key] = (byProgram[key] || 0) + 1;
  }
  results.push({
    task: name.replace(/\.json$/i, ''),
    inferred: Boolean(induction.solved),
    solved: taskCorrect,
    primary_program: induction.program?.name || '',
    solved_inputs: taskSolvedInputs,
    test_inputs: (task.test || []).length,
  });
}

const report = {
  schema: 'aura-arc-agi-2-training-development-v1',
  split,
  split_rule: 'holdout iff parseInt(firstByte(taskId),16) % 5 === 0',
  warning: 'Development-only score on public training data. Not an ARC-AGI evaluation score.',
  summary: {
    tasks: names.length,
    inferred_tasks: inferredTasks,
    solved_tasks: solvedTasks,
    task_accuracy: names.length ? solvedTasks / names.length : 0,
    test_inputs: totalInputs,
    solved_test_inputs: solvedInputs,
    test_input_accuracy: totalInputs ? solvedInputs / totalInputs : 0,
    by_program: byProgram,
  },
  results,
};

await fs.mkdir(path.dirname(outFile), { recursive: true });
await fs.writeFile(outFile, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log('ARC-AGI-2 TRAINING DEVELOPMENT SCORE');
console.log('Split:', split);
console.log('Tasks:', report.summary.tasks);
console.log('Inferred:', report.summary.inferred_tasks);
console.log('Solved tasks:', report.summary.solved_tasks);
console.log('Task accuracy:', (report.summary.task_accuracy * 100).toFixed(2) + '%');
console.log('Solved test inputs:', report.summary.solved_test_inputs + '/' + report.summary.test_inputs);
console.log('By program:', JSON.stringify(report.summary.by_program));
