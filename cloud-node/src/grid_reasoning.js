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


function scaleCells(grid, rowFactor, colFactor) {
  return grid.flatMap((row) => {
    const expanded = row.flatMap((value) => Array(colFactor).fill(value));
    return Array.from({ length: rowFactor }, () => [...expanded]);
  });
}

function tileGrid(grid, rowCopies, colCopies) {
  const out = [];
  for (let tr = 0; tr < rowCopies; tr += 1) {
    for (const row of grid) {
      const expanded = [];
      for (let tc = 0; tc < colCopies; tc += 1) expanded.push(...row);
      out.push(expanded);
    }
  }
  return out;
}

function inferScaleCells(training) {
  const first = training[0];
  if (first.output.length % first.input.length !== 0
    || first.output[0].length % first.input[0].length !== 0) return [];
  const rowFactor = first.output.length / first.input.length;
  const colFactor = first.output[0].length / first.input[0].length;
  if (rowFactor < 2 && colFactor < 2) return [];
  if (rowFactor > 8 || colFactor > 8) return [];
  if (!training.every((pair) =>
    pair.output.length === pair.input.length * rowFactor
    && pair.output[0].length === pair.input[0].length * colFactor
    && equalGrid(scaleCells(pair.input, rowFactor, colFactor), pair.output))) return [];
  return [{
    name: 'scale-cells',
    complexity: 4.5 + rowFactor * 0.1 + colFactor * 0.1,
    params: { row_factor: rowFactor, col_factor: colFactor },
  }];
}

function inferTileGrid(training) {
  const first = training[0];
  if (first.output.length % first.input.length !== 0
    || first.output[0].length % first.input[0].length !== 0) return [];
  const rowCopies = first.output.length / first.input.length;
  const colCopies = first.output[0].length / first.input[0].length;
  if (rowCopies < 2 && colCopies < 2) return [];
  if (rowCopies > 8 || colCopies > 8) return [];
  if (!training.every((pair) =>
    pair.output.length === pair.input.length * rowCopies
    && pair.output[0].length === pair.input[0].length * colCopies
    && equalGrid(tileGrid(pair.input, rowCopies, colCopies), pair.output))) return [];
  return [{
    name: 'tile-grid',
    complexity: 4.7 + rowCopies * 0.1 + colCopies * 0.1,
    params: { row_copies: rowCopies, col_copies: colCopies },
  }];
}

function applyFixedSequence(grid, steps = []) {
  let current = cloneGrid(grid);
  for (const step of steps) {
    const program = FIXED_PROGRAMS.find((item) => item.name === step);
    if (!program) throw new Error('étape géométrique inconnue: ' + step);
    current = program.apply(current);
  }
  return current;
}

function inferComposedPrograms(training) {
  const geometric = FIXED_PROGRAMS
    .map((item) => item.name)
    .filter((name) => name !== 'identity');
  const candidates = [];
  const sequences = [];
  for (const first of geometric) {
    for (const second of geometric) {
      if (first === second && ['mirror-horizontal', 'mirror-vertical', 'rotate-180'].includes(first)) continue;
      sequences.push([first, second]);
    }
  }

  for (const steps of sequences) {
    const transformed = training.map((pair) => ({
      input: applyFixedSequence(pair.input, steps),
      output: pair.output,
    }));
    if (transformed.every((pair) => equalGrid(pair.input, pair.output))) {
      candidates.push({
        name: 'compose-grid',
        complexity: 6.5,
        params: { steps, mapping: null },
      });
      continue;
    }
    const mapping = inferRecolor(transformed);
    if (mapping && transformed.every((pair) =>
      equalGrid(recolor(pair.input, mapping), pair.output))) {
      candidates.push({
        name: 'compose-grid',
        complexity: 7 + Object.keys(mapping).length * 0.05,
        params: { steps, mapping },
      });
    }
  }
  return candidates;
}

export function applyGridProgram(name, grid, params = {}) {
  if (!rectangular(grid)) throw new Error('grid invalide');
  const fixed = FIXED_PROGRAMS.find((item) => item.name === name);
  if (fixed) return fixed.apply(grid);
  if (name === 'recolor') return recolor(grid, params.mapping || {});
  if (name === 'scale-cells') return scaleCells(grid, params.row_factor, params.col_factor);
  if (name === 'tile-grid') return tileGrid(grid, params.row_copies, params.col_copies);
  if (name === 'compose-grid') {
    const transformed = applyFixedSequence(grid, params.steps || []);
    return params.mapping ? recolor(transformed, params.mapping) : transformed;
  }
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

  for (const candidate of inferScaleCells(pairs)) candidates.push(candidate);
  for (const candidate of inferTileGrid(pairs)) candidates.push(candidate);
  for (const candidate of inferComposedPrograms(pairs)) candidates.push(candidate);
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
