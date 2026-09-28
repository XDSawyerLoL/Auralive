import { applyAdvancedProgram, inferAdvancedPrograms } from './arc_object_reasoning.js';

function cloneGrid(grid) {
  return (Array.isArray(grid) ? grid : []).map((row) => [...row]);
}

function rectangular(grid) {
  return Array.isArray(grid)
    && grid.length > 0
    && grid.every((row) => Array.isArray(row) && row.length === grid[0].length);
}

function equalGrid(a, b) {
  return rectangular(a)
    && rectangular(b)
    && a.length === b.length
    && a[0].length === b[0].length
    && a.every((row, r) => row.every((value, c) => value === b[r][c]));
}

function rotate90(grid) {
  const h = grid.length;
  const w = grid[0].length;
  return Array.from({ length: w }, (_, r) =>
    Array.from({ length: h }, (_, c) => grid[h - 1 - c][r]));
}

function rotate180(grid) {
  return rotate90(rotate90(grid));
}

function rotate270(grid) {
  return rotate90(rotate180(grid));
}

function mirrorHorizontal(grid) {
  return grid.map((row) => [...row].reverse());
}

function mirrorVertical(grid) {
  return [...grid].reverse().map((row) => [...row]);
}

function cropNonZero(grid) {
  const points = [];
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < grid[r].length; c += 1) {
      if (grid[r][c] !== 0) points.push([r, c]);
    }
  }
  if (!points.length) return cloneGrid(grid);
  const rows = points.map(([r]) => r);
  const cols = points.map(([, c]) => c);
  const minR = Math.min(...rows);
  const maxR = Math.max(...rows);
  const minC = Math.min(...cols);
  const maxC = Math.max(...cols);
  return grid.slice(minR, maxR + 1).map((row) => row.slice(minC, maxC + 1));
}

function inferRecolor(training) {
  const mapping = new Map();
  let changed = false;
  for (const pair of training) {
    if (!rectangular(pair.input) || !rectangular(pair.output)) return null;
    if (pair.input.length !== pair.output.length || pair.input[0].length !== pair.output[0].length) return null;
    for (let r = 0; r < pair.input.length; r += 1) {
      for (let c = 0; c < pair.input[r].length; c += 1) {
        const from = pair.input[r][c];
        const to = pair.output[r][c];
        if (mapping.has(from) && mapping.get(from) !== to) return null;
        mapping.set(from, to);
        if (from !== to) changed = true;
      }
    }
  }
  if (!changed) return null;
  return Object.fromEntries([...mapping.entries()].map(([key, value]) => [String(key), value]));
}

function recolor(grid, mapping) {
  return grid.map((row) => row.map((value) =>
    Object.prototype.hasOwnProperty.call(mapping, String(value))
      ? mapping[String(value)]
      : value));
}

const FIXED_PROGRAMS = [
  { name: 'identity', complexity: 1, apply: cloneGrid },
  { name: 'mirror-horizontal', complexity: 2, apply: mirrorHorizontal },
  { name: 'mirror-vertical', complexity: 2, apply: mirrorVertical },
  { name: 'rotate-90', complexity: 3, apply: rotate90 },
  { name: 'rotate-180', complexity: 3, apply: rotate180 },
  { name: 'rotate-270', complexity: 3, apply: rotate270 },
  { name: 'crop-nonzero', complexity: 4, apply: cropNonZero },
];

export function applyGridProgram(name, grid, params = {}) {
  if (!rectangular(grid)) throw new Error('grid invalide');
  const fixed = FIXED_PROGRAMS.find((item) => item.name === name);
  if (fixed) return fixed.apply(grid);
  if (name === 'recolor') return recolor(grid, params.mapping || {});
  const advanced = applyAdvancedProgram(name, grid, params);
  if (advanced) return advanced;
  throw new Error('programme de grille inconnu: ' + name);
}

export function induceGridProgram(training = []) {
  const pairs = (Array.isArray(training) ? training : []).filter((pair) =>
    rectangular(pair?.input) && rectangular(pair?.output));
  if (!pairs.length) return { solved: false, reason: 'training-empty', candidates: [] };

  const candidates = [];
  for (const program of FIXED_PROGRAMS) {
    if (pairs.every((pair) => equalGrid(program.apply(pair.input), pair.output))) {
      candidates.push({ name: program.name, complexity: program.complexity, params: {} });
    }
  }

  const mapping = inferRecolor(pairs);
  if (mapping && pairs.every((pair) => equalGrid(recolor(pair.input, mapping), pair.output))) {
    candidates.push({ name: 'recolor', complexity: 3 + Object.keys(mapping).length * 0.05, params: { mapping } });
  }

  for (const candidate of inferAdvancedPrograms(pairs)) candidates.push(candidate);

  candidates.sort((a, b) => a.complexity - b.complexity || a.name.localeCompare(b.name));
  if (!candidates.length) return { solved: false, reason: 'no-program-fits', candidates: [] };

  return {
    solved: true,
    program: candidates[0],
    candidates,
    verified_examples: pairs.length,
  };
}

export function solveGridTask({ train = [], test = [] } = {}) {
  const induction = induceGridProgram(train);
  if (!induction.solved) return { ...induction, outputs: [] };
  const outputs = (Array.isArray(test) ? test : []).map((grid) =>
    applyGridProgram(induction.program.name, grid, induction.program.params));
  return { ...induction, outputs };
}

export function gridEquals(a, b) {
  return equalGrid(a, b);
}
