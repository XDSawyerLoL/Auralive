
function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

function rectangular(grid) {
  return Array.isArray(grid)
    && grid.length > 0
    && Array.isArray(grid[0])
    && grid[0].length > 0
    && grid.every((row) => Array.isArray(row) && row.length === grid[0].length);
}

function equalGrid(a, b) {
  return rectangular(a)
    && rectangular(b)
    && a.length === b.length
    && a[0].length === b[0].length
    && a.every((row, r) => row.every((value, c) => value === b[r][c]));
}

function colorCounts(grid) {
  const counts = new Map();
  for (const row of grid) {
    for (const value of row) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function dominantColor(grid) {
  const counts = [...colorCounts(grid).entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return counts[0]?.[0] ?? 0;
}

function dominantColorExcluding(grid, excluded = new Set()) {
  const counts = [...colorCounts(grid).entries()]
    .filter(([color]) => !excluded.has(color))
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return counts[0]?.[0] ?? 0;
}

function colors(grid) {
  return [...colorCounts(grid).keys()].sort((a, b) => a - b);
}

function componentKey(cells) {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  return cells
    .map(([r, c]) => [r - minR, c - minC])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([r, c]) => r + ':' + c)
    .join('|');
}

function transformedShapeKeys(cells) {
  const base = cells.map(([r, c]) => [r, c]);
  const transforms = [
    ([r, c]) => [r, c],
    ([r, c]) => [r, -c],
    ([r, c]) => [-r, c],
    ([r, c]) => [-r, -c],
    ([r, c]) => [c, r],
    ([r, c]) => [c, -r],
    ([r, c]) => [-c, r],
    ([r, c]) => [-c, -r],
  ];
  return new Set(transforms.map((fn) => componentKey(base.map(fn))));
}

function components(grid, {
  background = dominantColor(grid),
  includeBackground = false,
  diagonal = false,
} = {}) {
  const h = grid.length;
  const w = grid[0].length;
  const seen = Array.from({ length: h }, () => Array(w).fill(false));
  const dirs = diagonal
    ? [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]
    : [[1,0],[-1,0],[0,1],[0,-1]];
  const out = [];

  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      if (seen[r][c]) continue;
      const color = grid[r][c];
      if (!includeBackground && color === background) {
        seen[r][c] = true;
        continue;
      }
      const queue = [[r, c]];
      seen[r][c] = true;
      const cells = [];
      while (queue.length) {
        const [cr, cc] = queue.shift();
        cells.push([cr, cc]);
        for (const [dr, dc] of dirs) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nr >= h || nc < 0 || nc >= w || seen[nr][nc]) continue;
          if (grid[nr][nc] !== color) continue;
          seen[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }
      const rows = cells.map(([rr]) => rr);
      const cols = cells.map(([, cc]) => cc);
      const minR = Math.min(...rows);
      const maxR = Math.max(...rows);
      const minC = Math.min(...cols);
      const maxC = Math.max(...cols);
      out.push({
        color,
        cells,
        size: cells.length,
        minR,
        maxR,
        minC,
        maxC,
        height: maxR - minR + 1,
        width: maxC - minC + 1,
        shape_key: componentKey(cells),
        shape_keys_d4: transformedShapeKeys(cells),
      });
    }
  }
  return out;
}

function changedCells(input, output) {
  if (!rectangular(input) || !rectangular(output)
    || input.length !== output.length
    || input[0].length !== output[0].length) return [];
  const out = [];
  for (let r = 0; r < input.length; r += 1) {
    for (let c = 0; c < input[r].length; c += 1) {
      if (input[r][c] !== output[r][c]) out.push([r, c, input[r][c], output[r][c]]);
    }
  }
  return out;
}

function sameShape(a, b) {
  return a.shape_keys_d4.has(b.shape_key);
}

function paintCells(grid, cells, color, { onlyBackground = false, background = 0 } = {}) {
  for (const [r, c] of cells) {
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) continue;
    if (onlyBackground && grid[r][c] !== background) continue;
    grid[r][c] = color;
  }
}

function lPath(a, b, mode) {
  const [ar, ac] = a;
  const [br, bc] = b;
  const corner = mode === 'row-a'
    ? [ar, bc]
    : [br, ac];
  const cells = [];
  const addSegment = (r1, c1, r2, c2) => {
    const dr = Math.sign(r2 - r1);
    const dc = Math.sign(c2 - c1);
    let r = r1;
    let c = c1;
    cells.push([r, c]);
    while (r !== r2 || c !== c2) {
      r += dr;
      c += dc;
      cells.push([r, c]);
    }
  };
  addSegment(ar, ac, corner[0], corner[1]);
  addSegment(corner[0], corner[1], br, bc);
  const uniq = new Map();
  for (const cell of cells) uniq.set(cell.join(','), cell);
  uniq.delete(a.join(','));
  uniq.delete(b.join(','));
  return [...uniq.values()];
}

function locateSingleColor(grid, color) {
  const cells = [];
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < grid[r].length; c += 1) {
      if (grid[r][c] === color) cells.push([r, c]);
    }
  }
  return cells.length === 1 ? cells[0] : null;
}

function applyConnectAnchors(grid, params) {
  const out = cloneGrid(grid);
  const a = locateSingleColor(grid, params.anchor_a);
  const b = locateSingleColor(grid, params.anchor_b);
  if (!a || !b) return out;
  const background = dominantColor(grid);
  paintCells(out, lPath(a, b, params.mode), params.fill_color, {
    onlyBackground: true,
    background,
  });
  return out;
}

function inferConnectAnchors(training) {
  const first = training[0];
  if (!first || first.input.length !== first.output.length
    || first.input[0].length !== first.output[0].length) return [];
  const diffs = changedCells(first.input, first.output);
  if (!diffs.length) return [];
  const fillColors = [...new Set(diffs.map(([, , , to]) => to))];
  if (fillColors.length !== 1) return [];
  const fillColor = fillColors[0];
  const bg = dominantColor(first.input);
  const candidateColors = colors(first.input).filter((color) =>
    color !== bg && color !== fillColor && locateSingleColor(first.input, color));
  const candidates = [];
  for (const anchorA of candidateColors) {
    for (const anchorB of candidateColors) {
      if (anchorA === anchorB) continue;
      for (const mode of ['row-a', 'row-b']) {
        const params = {
          anchor_a: anchorA,
          anchor_b: anchorB,
          fill_color: fillColor,
          mode,
        };
        if (training.every((pair) => equalGrid(applyConnectAnchors(pair.input, params), pair.output))) {
          candidates.push({
            name: 'connect-anchors-l',
            complexity: 5.2,
            params,
          });
        }
      }
    }
  }
  return candidates;
}

function applyRecolorCongruent(grid, params) {
  const out = cloneGrid(grid);
  const background = dominantColor(grid);
  const comps = components(grid, { background });
  const references = comps.filter((item) => item.color === params.target_color);
  if (!references.length) return out;
  for (const comp of comps) {
    if (comp.color === params.target_color) continue;
    if (references.some((ref) => sameShape(ref, comp))) {
      paintCells(out, comp.cells, params.target_color);
    }
  }
  return out;
}

function inferRecolorCongruent(training) {
  const targets = new Set();
  for (const pair of training) {
    const diffs = changedCells(pair.input, pair.output);
    if (!diffs.length) return [];
    const toColors = new Set(diffs.map(([, , , to]) => to));
    if (toColors.size !== 1) return [];
    targets.add([...toColors][0]);
  }
  if (targets.size !== 1) return [];
  const targetColor = [...targets][0];
  for (const pair of training) {
    const background = dominantColor(pair.input);
    const comps = components(pair.input, { background });
    const refs = comps.filter((item) => item.color === targetColor);
    if (!refs.length) return [];
    const diffs = changedCells(pair.input, pair.output);
    const changedCoordinates = new Set(diffs.map(([r, c]) => r + ',' + c));
    const changedComps = comps.filter((item) => item.cells.some(([r, c]) => changedCoordinates.has(r + ',' + c)));
    if (!changedComps.length) return [];
    for (const comp of changedComps) {
      if (comp.color === targetColor) return [];
      if (!comp.cells.every(([r, c]) => changedCoordinates.has(r + ',' + c))) return [];
      if (!refs.some((ref) => sameShape(ref, comp))) return [];
    }
  }
  const params = { target_color: targetColor };
  if (!training.every((pair) => equalGrid(applyRecolorCongruent(pair.input, params), pair.output))) return [];
  return [{ name: 'recolor-congruent-object', complexity: 6.0, params }];
}

function isFilledRectangle(comp) {
  return comp.size === comp.height * comp.width;
}

function reflectCell([r, c], center2, axis) {
  return axis === 'vertical'
    ? [r, center2 - c]
    : [center2 - r, c];
}

function applyCopyAroundPivot(grid, params) {
  const background = dominantColor(grid);
  const comps = components(grid, { background });
  const pivot = comps.find((item) => item.color === params.pivot_color && isFilledRectangle(item));
  const object = comps.find((item) => item.color === params.object_color);
  if (!pivot || !object) return cloneGrid(grid);

  const out = cloneGrid(grid);
  const verticalCenter2 = pivot.minC + pivot.maxC;
  const horizontalCenter2 = pivot.minR + pivot.maxR;
  const copies = [
    object.cells.map((cell) => reflectCell(cell, verticalCenter2, 'vertical')),
    object.cells.map((cell) => reflectCell(cell, horizontalCenter2, 'horizontal')),
    object.cells
      .map((cell) => reflectCell(cell, verticalCenter2, 'vertical'))
      .map((cell) => reflectCell(cell, horizontalCenter2, 'horizontal')),
  ];
  for (const cells of copies) {
    paintCells(out, cells, params.object_color, {
      onlyBackground: true,
      background,
    });
  }
  return out;
}

function inferCopyAroundPivot(training) {
  const first = training[0];
  const background = dominantColor(first.input);
  const comps = components(first.input, { background });
  const colorsPresent = [...new Set(comps.map((item) => item.color))];
  const candidates = [];
  for (const pivotColor of colorsPresent) {
    for (const objectColor of colorsPresent) {
      if (pivotColor === objectColor) continue;
      const params = {
        pivot_color: pivotColor,
        object_color: objectColor,
      };
      if (training.every((pair) => equalGrid(applyCopyAroundPivot(pair.input, params), pair.output))) {
        candidates.push({ name: 'copy-around-pivot', complexity: 6.2, params });
      }
    }
  }
  return candidates;
}

function separatorInfo(grid, separatorColor) {
  const h = grid.length;
  const w = grid[0].length;
  const separatorRows = [];
  const separatorCols = [];
  for (let r = 0; r < h; r += 1) {
    if (grid[r].every((value) => value === separatorColor)) separatorRows.push(r);
  }
  for (let c = 0; c < w; c += 1) {
    let full = true;
    for (let r = 0; r < h; r += 1) {
      if (grid[r][c] !== separatorColor) {
        full = false;
        break;
      }
    }
    if (full) separatorCols.push(c);
  }
  if (!separatorRows.length || !separatorCols.length) return null;

  const segments = (length, separators) => {
    const out = [];
    let start = 0;
    for (const index of separators) {
      if (index > start) out.push([start, index - 1]);
      start = index + 1;
    }
    if (start < length) out.push([start, length - 1]);
    return out.filter(([a, b]) => b >= a);
  };
  return {
    separatorRows,
    separatorCols,
    rowSegments: segments(h, separatorRows),
    colSegments: segments(w, separatorCols),
  };
}

function extractRegion(grid, r0, r1, c0, c1) {
  return grid.slice(r0, r1 + 1).map((row) => row.slice(c0, c1 + 1));
}

function placeRegion(grid, region, r0, c0, { backgroundOnly = false, background = 0 } = {}) {
  for (let r = 0; r < region.length; r += 1) {
    for (let c = 0; c < region[r].length; c += 1) {
      const rr = r0 + r;
      const cc = c0 + c;
      if (rr < 0 || rr >= grid.length || cc < 0 || cc >= grid[0].length) continue;
      if (region[r][c] === background) continue;
      if (backgroundOnly && grid[rr][cc] !== background) continue;
      grid[rr][cc] = region[r][c];
    }
  }
}

function regionHasContent(region, background) {
  return region.some((row) => row.some((value) => value !== background));
}

function applyTileGridModulo(grid, params) {
  const info = separatorInfo(grid, params.separator_color);
  if (!info) return cloneGrid(grid);
  const background = params.background_color;
  const nonEmpty = [];
  for (let ri = 0; ri < info.rowSegments.length; ri += 1) {
    const [r0, r1] = info.rowSegments[ri];
    for (let ci = 0; ci < info.colSegments.length; ci += 1) {
      const [c0, c1] = info.colSegments[ci];
      const region = extractRegion(grid, r0, r1, c0, c1);
      if (regionHasContent(region, background)) nonEmpty.push({ ri, ci, r0, c0, region });
    }
  }
  if (nonEmpty.length !== 1) return cloneGrid(grid);
  const source = nonEmpty[0];
  const out = cloneGrid(grid);
  for (let ri = 0; ri < info.rowSegments.length; ri += 1) {
    if ((ri - source.ri) % params.row_modulo !== 0) continue;
    for (let ci = 0; ci < info.colSegments.length; ci += 1) {
      if ((ci - source.ci) % params.col_modulo !== 0) continue;
      const [r0, r1] = info.rowSegments[ri];
      const [c0, c1] = info.colSegments[ci];
      if ((r1 - r0) !== (source.region.length - 1)
        || (c1 - c0) !== (source.region[0].length - 1)) continue;
      placeRegion(out, source.region, r0, c0, {
        backgroundOnly: true,
        background,
      });
    }
  }
  return out;
}

function inferTileGridModulo(training) {
  const first = training[0];
  const candidates = [];
  for (const separatorColor of colors(first.input)) {
    if (!separatorInfo(first.input, separatorColor)) continue;
    const background = dominantColorExcluding(first.input, new Set([separatorColor]));
    for (let rowModulo = 1; rowModulo <= 4; rowModulo += 1) {
      for (let colModulo = 1; colModulo <= 4; colModulo += 1) {
        const params = {
          separator_color: separatorColor,
          background_color: background,
          row_modulo: rowModulo,
          col_modulo: colModulo,
        };
        if (training.every((pair) => equalGrid(applyTileGridModulo(pair.input, params), pair.output))) {
          candidates.push({ name: 'tile-grid-modulo', complexity: 7.0 + rowModulo * 0.1 + colModulo * 0.1, params });
        }
      }
    }
  }
  return candidates;
}

function permutation(values) {
  if (values.length <= 1) return [values];
  const out = [];
  for (let i = 0; i < values.length; i += 1) {
    const rest = values.slice(0, i).concat(values.slice(i + 1));
    for (const tail of permutation(rest)) out.push([values[i], ...tail]);
  }
  return out;
}

function singleCrossSeparator(grid, separatorColor) {
  const rows = [];
  const cols = [];
  for (let r = 0; r < grid.length; r += 1) {
    if (grid[r].every((value) => value === separatorColor)) rows.push(r);
  }
  for (let c = 0; c < grid[0].length; c += 1) {
    let full = true;
    for (let r = 0; r < grid.length; r += 1) {
      if (grid[r][c] !== separatorColor) {
        full = false;
        break;
      }
    }
    if (full) cols.push(c);
  }
  if (rows.length !== 1 || cols.length !== 1) return null;
  const sr = rows[0];
  const sc = cols[0];
  if (sr <= 0 || sc <= 0 || sr >= grid.length - 1 || sc >= grid[0].length - 1) return null;
  const quadrants = [
    extractRegion(grid, 0, sr - 1, 0, sc - 1),
    extractRegion(grid, 0, sr - 1, sc + 1, grid[0].length - 1),
    extractRegion(grid, sr + 1, grid.length - 1, 0, sc - 1),
    extractRegion(grid, sr + 1, grid.length - 1, sc + 1, grid[0].length - 1),
  ];
  if (!quadrants.every((q) =>
    q.length === quadrants[0].length
    && q[0].length === quadrants[0][0].length)) return null;
  return { sr, sc, quadrants };
}

function applyOverlayQuadrants(grid, params) {
  const cross = singleCrossSeparator(grid, params.separator_color);
  if (!cross) return cloneGrid(grid);
  const h = cross.quadrants[0].length;
  const w = cross.quadrants[0][0].length;
  const out = Array.from({ length: h }, () => Array(w).fill(params.background_color));
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      for (const index of params.priority) {
        const value = cross.quadrants[index][r][c];
        if (value !== params.background_color) {
          out[r][c] = value;
          break;
        }
      }
    }
  }
  return out;
}

function inferOverlayQuadrants(training) {
  const first = training[0];
  const candidates = [];
  for (const separatorColor of colors(first.input)) {
    if (!singleCrossSeparator(first.input, separatorColor)) continue;
    const background = dominantColorExcluding(first.input, new Set([separatorColor]));
    for (const priority of permutation([0, 1, 2, 3])) {
      const params = {
        separator_color: separatorColor,
        background_color: background,
        priority,
      };
      if (training.every((pair) => equalGrid(applyOverlayQuadrants(pair.input, params), pair.output))) {
        candidates.push({ name: 'overlay-quadrants', complexity: 6.8, params });
      }
    }
  }
  return candidates;
}

function minVerticalPeriod(grid) {
  for (let period = 1; period <= grid.length; period += 1) {
    let ok = true;
    for (let r = 0; r < grid.length; r += 1) {
      for (let c = 0; c < grid[0].length; c += 1) {
        if (grid[r][c] !== grid[r % period][c]) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
    }
    if (ok) return period;
  }
  return grid.length;
}

function minHorizontalPeriod(grid) {
  for (let period = 1; period <= grid[0].length; period += 1) {
    let ok = true;
    for (let r = 0; r < grid.length; r += 1) {
      for (let c = 0; c < grid[0].length; c += 1) {
        if (grid[r][c] !== grid[r][c % period]) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
    }
    if (ok) return period;
  }
  return grid[0].length;
}

function inferCellMapping(raw, output, mapping) {
  if (raw.length !== output.length || raw[0].length !== output[0].length) return false;
  for (let r = 0; r < raw.length; r += 1) {
    for (let c = 0; c < raw[r].length; c += 1) {
      const key = String(raw[r][c]);
      const value = output[r][c];
      if (mapping.has(key) && mapping.get(key) !== value) return false;
      mapping.set(key, value);
    }
  }
  return true;
}

function tilePeriodic(grid, axis, targetLength) {
  if (axis === 'vertical') {
    const period = minVerticalPeriod(grid);
    return Array.from({ length: targetLength }, (_, r) => [...grid[r % period]]);
  }
  const period = minHorizontalPeriod(grid);
  return grid.map((row) =>
    Array.from({ length: targetLength }, (_, c) => row[c % period]));
}

function applyRepeatPeriodic(grid, params) {
  const inputLength = params.axis === 'vertical' ? grid.length : grid[0].length;
  const targetLength = Math.max(1, Math.round(inputLength * params.factor_num / params.factor_den));
  const raw = tilePeriodic(grid, params.axis, targetLength);
  return raw.map((row) => row.map((value) =>
    Object.prototype.hasOwnProperty.call(params.mapping, String(value))
      ? params.mapping[String(value)]
      : value));
}

function inferRepeatPeriodic(training) {
  const first = training[0];
  const modes = [];
  if (first.input[0].length === first.output[0].length && first.input.length !== first.output.length) {
    modes.push('vertical');
  }
  if (first.input.length === first.output.length && first.input[0].length !== first.output[0].length) {
    modes.push('horizontal');
  }
  const out = [];
  for (const axis of modes) {
    const inLen = axis === 'vertical' ? first.input.length : first.input[0].length;
    const outLen = axis === 'vertical' ? first.output.length : first.output[0].length;
    const divisor = (a, b) => b ? divisor(b, a % b) : a;
    const g = divisor(inLen, outLen);
    const factorNum = outLen / g;
    const factorDen = inLen / g;
    const mapping = new Map();
    let valid = true;
    for (const pair of training) {
      const pairInLen = axis === 'vertical' ? pair.input.length : pair.input[0].length;
      const pairOutLen = axis === 'vertical' ? pair.output.length : pair.output[0].length;
      if (pairOutLen * factorDen !== pairInLen * factorNum) {
        valid = false;
        break;
      }
      const raw = tilePeriodic(pair.input, axis, pairOutLen);
      if (!inferCellMapping(raw, pair.output, mapping)) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    const params = {
      axis,
      factor_num: factorNum,
      factor_den: factorDen,
      mapping: Object.fromEntries(mapping),
    };
    if (training.every((pair) => equalGrid(applyRepeatPeriodic(pair.input, params), pair.output))) {
      out.push({ name: 'repeat-periodic-recolor', complexity: 5.8, params });
    }
  }
  return out;
}

function applyDiagonalExtrusion(grid, params) {
  if (grid.length !== 1) return cloneGrid(grid);
  const background = params.background_color;
  const nonBackground = grid[0].filter((value) => value !== background).length;
  const size = grid[0].length * nonBackground;
  if (size <= 0) return cloneGrid(grid);
  const out = Array.from({ length: size }, () => Array(size).fill(background));
  for (let r = 0; r < size; r += 1) {
    const shift = size - 1 - r;
    for (let c = 0; c < grid[0].length; c += 1) {
      const target = shift + c;
      if (target >= 0 && target < size) out[r][target] = grid[0][c];
    }
  }
  return out;
}

function inferDiagonalExtrusion(training) {
  const background = dominantColor(training[0].input);
  const params = { background_color: background };
  if (!training.every((pair) =>
    pair.input.length === 1
    && equalGrid(applyDiagonalExtrusion(pair.input, params), pair.output))) return [];
  return [{ name: 'diagonal-extrusion', complexity: 6.1, params }];
}

function topRunLength(grid, color, column = 0) {
  let count = 0;
  while (count < grid.length && grid[count][column] === color) count += 1;
  return count;
}

function constantColumnColor(grid, col) {
  const value = grid[0][col];
  if (value === undefined) return null;
  return grid.every((row) => row[col] === value) ? value : null;
}

function applyMarkerPaletteCycle(grid, params) {
  const h = grid.length;
  const w = grid[0].length;
  const background = params.background_color;
  const markerLength = topRunLength(grid, params.marker_color, params.marker_column);
  if (!markerLength) return cloneGrid(grid);

  const palette = [];
  for (let c = params.palette_start; c < w; c += 1) {
    const color = constantColumnColor(grid, c);
    if (color === null || color === background) return cloneGrid(grid);
    palette.push(color);
  }
  if (!palette.length) return cloneGrid(grid);

  const out = cloneGrid(grid);
  for (let c = params.palette_start; c < w; c += 1) {
    for (let r = 0; r < h; r += 1) out[r][c] = background;
  }
  const targetCol = params.palette_start - 1;
  if (targetCol < 0) return cloneGrid(grid);
  for (let r = 0; r < h; r += 1) {
    out[r][targetCol] = palette[Math.floor(r / markerLength) % palette.length];
  }
  return out;
}

function inferMarkerPaletteCycle(training) {
  const first = training[0];
  const background = dominantColor(first.input);
  const candidates = [];
  for (let markerColumn = 0; markerColumn < first.input[0].length; markerColumn += 1) {
    for (const markerColor of colors(first.input).filter((color) => color !== background)) {
      const run = topRunLength(first.input, markerColor, markerColumn);
      if (!run) continue;
      for (let paletteStart = 1; paletteStart < first.input[0].length; paletteStart += 1) {
        const params = {
          background_color: background,
          marker_color: markerColor,
          marker_column: markerColumn,
          palette_start: paletteStart,
        };
        if (training.every((pair) => equalGrid(applyMarkerPaletteCycle(pair.input, params), pair.output))) {
          candidates.push({ name: 'marker-palette-cycle', complexity: 6.4, params });
        }
      }
    }
  }
  return candidates;
}

export function applyAdvancedProgram(name, grid, params = {}) {
  if (!rectangular(grid)) throw new Error('grid invalide');
  if (name === 'connect-anchors-l') return applyConnectAnchors(grid, params);
  if (name === 'recolor-congruent-object') return applyRecolorCongruent(grid, params);
  if (name === 'copy-around-pivot') return applyCopyAroundPivot(grid, params);
  if (name === 'tile-grid-modulo') return applyTileGridModulo(grid, params);
  if (name === 'overlay-quadrants') return applyOverlayQuadrants(grid, params);
  if (name === 'repeat-periodic-recolor') return applyRepeatPeriodic(grid, params);
  if (name === 'diagonal-extrusion') return applyDiagonalExtrusion(grid, params);
  if (name === 'marker-palette-cycle') return applyMarkerPaletteCycle(grid, params);
  return null;
}

export function inferAdvancedPrograms(training = []) {
  const pairs = (Array.isArray(training) ? training : [])
    .filter((pair) => rectangular(pair?.input) && rectangular(pair?.output));
  if (!pairs.length) return [];
  const inferers = [
    inferConnectAnchors,
    inferRecolorCongruent,
    inferCopyAroundPivot,
    inferTileGridModulo,
    inferOverlayQuadrants,
    inferRepeatPeriodic,
    inferDiagonalExtrusion,
    inferMarkerPaletteCycle,
  ];
  const candidates = [];
  for (const inferer of inferers) {
    try {
      for (const candidate of inferer(pairs) || []) candidates.push(candidate);
    } catch {
    }
  }
  const unique = new Map();
  for (const candidate of candidates) {
    const key = candidate.name + ':' + JSON.stringify(candidate.params || {});
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()]
    .sort((a, b) => a.complexity - b.complexity || a.name.localeCompare(b.name));
}

export function arcObjectSummary(grid) {
  if (!rectangular(grid)) return { valid: false };
  const background = dominantColor(grid);
  const comps = components(grid, { background });
  return {
    valid: true,
    height: grid.length,
    width: grid[0].length,
    background,
    colors: colors(grid),
    components: comps.map((item) => ({
      color: item.color,
      size: item.size,
      bbox: [item.minR, item.minC, item.maxR, item.maxC],
      shape_key: item.shape_key,
    })),
  };
}
