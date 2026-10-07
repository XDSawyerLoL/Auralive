
import test from 'node:test';
import assert from 'node:assert/strict';

import { induceGridProgram, applyGridProgram, gridEquals } from '../src/grid_reasoning.js';

function solve(train, input) {
  const inferred = induceGridProgram(train);
  assert.equal(inferred.solved, true, 'no program inferred');
  return {
    inferred,
    output: applyGridProgram(inferred.program.name, input, inferred.program.params),
  };
}

test('infers L-shaped connection between two colored anchors', () => {
  const input = [
    [0,0,0,0,8,0],
    [0,0,0,0,0,0],
    [0,0,0,0,0,0],
    [0,2,0,0,0,0],
  ];
  const output = [
    [0,0,0,0,8,0],
    [0,0,0,0,4,0],
    [0,0,0,0,4,0],
    [0,2,4,4,4,0],
  ];
  const result = solve([{ input, output }], input);
  assert.equal(result.inferred.program.name, 'connect-anchors-l');
  assert.equal(gridEquals(result.output, output), true);
});

test('recolors an object congruent to a reference object', () => {
  const input = [
    [5,5,0,0,0,0],
    [5,0,0,0,3,0],
    [0,0,0,3,3,0],
    [0,0,3,0,0,0],
  ];
  const output = [
    [5,5,0,0,0,0],
    [5,0,0,0,5,0],
    [0,0,0,5,5,0],
    [0,0,3,0,0,0],
  ];
  const result = solve([{ input, output }], input);
  assert.equal(result.inferred.program.name, 'recolor-congruent-object');
  assert.equal(gridEquals(result.output, output), true);
});

test('copies an object across both axes around a rectangular pivot', () => {
  const input = [
    [2,2,0,0,0,0,0,0],
    [2,0,0,0,0,0,0,0],
    [0,0,0,3,3,0,0,0],
    [0,0,0,3,3,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
  ];
  const output = [
    [2,2,0,0,0,0,2,2],
    [2,0,0,0,0,0,0,2],
    [0,0,0,3,3,0,0,0],
    [0,0,0,3,3,0,0,0],
    [2,0,0,0,0,0,0,2],
    [2,2,0,0,0,0,2,2],
  ];
  const result = solve([{ input, output }], input);
  assert.equal(result.inferred.program.name, 'copy-around-pivot');
  assert.equal(gridEquals(result.output, output), true);
});

test('overlays four separator-defined quadrants by learned priority', () => {
  const input = [
    [7,0,1,0,4],
    [0,7,1,4,0],
    [1,1,1,1,1],
    [8,0,1,0,6],
    [0,8,1,6,0],
  ];
  const output = [
    [7,4],
    [4,7],
  ];
  const result = solve([{ input, output }], input);
  assert.equal(result.inferred.program.name, 'overlay-quadrants');
  assert.equal(gridEquals(result.output, output), true);
});


test('uses an L-shaped marker frame to recolor a matching object outside the frame', () => {
  const input = [
    [0,3,0,5,0,0,0,0],
    [3,3,0,5,0,0,0,0],
    [0,0,0,5,0,0,9,0],
    [5,5,5,5,0,9,9,0],
    [9,0,0,0,0,0,0,0],
  ];
  const output = [
    [0,3,0,5,0,0,0,0],
    [3,3,0,5,0,0,0,0],
    [0,0,0,5,0,0,5,0],
    [5,5,5,5,0,5,5,0],
    [9,0,0,0,0,0,0,0],
  ];
  const result = solve([{ input, output }], input);
  assert.equal(result.inferred.program.name, 'recolor-marker-matched-object');
  assert.equal(gridEquals(result.output, output), true);
});

test('uses a small separator-defined key to recolor blocks of a larger pattern region', () => {
  const input = [
    [1,2,8,0,0,0,0,0,0],
    [4,1,8,0,0,0,0,0,0],
    [8,8,8,8,8,8,8,8,8],
    [0,0,8,0,3,3,0,3,0],
    [0,0,8,3,3,0,0,0,0],
    [0,0,8,3,0,3,0,3,0],
    [0,0,8,0,0,0,3,0,0],
    [0,0,8,3,3,3,3,3,3],
    [0,0,8,0,0,0,3,0,0],
  ];
  const output = [
    [0,1,1,0,2,0],
    [1,1,0,0,0,0],
    [1,0,1,0,2,0],
    [0,0,0,1,0,0],
    [4,4,4,1,1,1],
    [0,0,0,1,0,0],
  ];
  const result = solve([{ input, output }], input);
  assert.equal(result.inferred.program.name, 'keyed-region-recolor');
  assert.equal(gridEquals(result.output, output), true);
});


test('learns a marker stencil from the completed exemplar inside each grid', () => {
  const input = [
    [0,8,0,0,0,8,0],
    [8,1,1,0,8,1,1],
    [0,1,0,0,0,1,0],
    [0,0,0,0,0,0,0],
    [4,8,4,0,0,0,0],
    [8,1,1,0,0,0,0],
    [4,1,4,0,0,0,0],
  ];
  const output = [
    [4,8,4,0,4,8,4],
    [8,1,1,0,8,1,1],
    [4,1,4,0,4,1,4],
    [0,0,0,0,0,0,0],
    [4,8,4,0,0,0,0],
    [8,1,1,0,0,0,0],
    [4,1,4,0,0,0,0],
  ];
  const result = solve([{ input, output }], input);
  assert.equal(result.inferred.program.name, 'self-template-stencil');
  assert.equal(gridEquals(result.output, output), true);
});

test('recolors the larger diagonal orientation differently from the smaller one', () => {
  const inputA = [
    [5,0,0,0,0,5],
    [0,5,0,0,5,0],
    [0,0,5,5,0,0],
    [0,0,0,5,0,0],
    [0,0,0,0,5,0],
    [0,0,0,0,0,0],
  ];
  const outputA = [
    [8,0,0,0,0,2],
    [0,8,0,0,2,0],
    [0,0,8,2,0,0],
    [0,0,0,8,0,0],
    [0,0,0,0,8,0],
    [0,0,0,0,0,0],
  ];
  const inputB = [
    [5,0,0,0,0,5],
    [0,5,0,0,5,0],
    [0,0,0,5,0,0],
    [0,0,5,0,0,0],
    [0,5,0,0,0,0],
    [0,0,0,0,0,0],
  ];
  const outputB = [
    [2,0,0,0,0,8],
    [0,2,0,0,8,0],
    [0,0,0,8,0,0],
    [0,0,8,0,0,0],
    [0,8,0,0,0,0],
    [0,0,0,0,0,0],
  ];
  const result = solve([
    { input: inputA, output: outputA },
    { input: inputB, output: outputB },
  ], inputA);
  assert.equal(result.inferred.program.name, 'recolor-diagonal-orientations-by-mass');
  assert.equal(gridEquals(result.output, outputA), true);
});


test('composes crop then rotation then recoloring from examples', () => {
  const input = [
    [0,0,0,0],
    [0,2,3,0],
    [0,0,2,0],
    [0,0,0,0],
  ];
  const cropped = [
    [2,3],
    [0,2],
  ];
  const output = [
    [0,7],
    [7,4],
  ];
  const result = solve([{ input, output }], input);
  assert.equal(result.inferred.program.name, 'compose-grid');
  assert.equal(gridEquals(result.output, output), true);
  assert.ok(result.inferred.program.params.steps.includes('crop-nonzero'));
});

test('infers cell scaling independently of colors', () => {
  const input = [
    [1,2],
    [3,4],
  ];
  const output = [
    [1,1,2,2],
    [1,1,2,2],
    [3,3,4,4],
    [3,3,4,4],
  ];
  const result = solve([{ input, output }], input);
  assert.equal(result.inferred.program.name, 'scale-cells');
  assert.equal(gridEquals(result.output, output), true);
});

test('infers whole-grid tiling independently of colors', () => {
  const input = [
    [1,2],
    [3,4],
  ];
  const output = [
    [1,2,1,2],
    [3,4,3,4],
    [1,2,1,2],
    [3,4,3,4],
  ];
  const result = solve([{ input, output }], input);
  assert.equal(result.inferred.program.name, 'tile-grid');
  assert.equal(gridEquals(result.output, output), true);
});


test('learns a boolean occupancy rule between separator-defined panels', () => {
  const input = [
    [1,0,1,8,0,1,1],
    [0,1,0,8,1,1,0],
    [1,1,0,8,1,0,0],
  ];
  const output = [
    [2,2,0],
    [2,0,0],
    [0,2,0],
  ];
  const result = solve([{ input, output }], input);
  assert.equal(result.inferred.program.name, 'combine-separated-occupancy');
  assert.equal(gridEquals(result.output, output), true);
});

test('extracts a uniquely largest component and learns output recoloring', () => {
  const input = [
    [0,2,2,0,0,3,0],
    [0,2,0,0,0,3,0],
    [0,2,0,0,0,0,0],
    [0,0,0,0,4,0,0],
    [0,0,0,0,0,0,0],
  ];
  const output = [
    [7,7],
    [7,0],
    [7,0],
  ];
  const result = solve([{ input, output }], input);
  assert.equal(result.inferred.program.name, 'extract-selected-object');
  assert.equal(gridEquals(result.output, output), true);
  assert.equal(result.inferred.program.params.selector, 'largest-size');
});

test('extends a periodic pattern and learns recoloring', () => {
  const input = [
    [0,1,0],
    [1,0,1],
    [0,1,0],
    [1,0,1],
  ];
  const output = [
    [0,2,0],
    [2,0,2],
    [0,2,0],
    [2,0,2],
    [0,2,0],
    [2,0,2],
  ];
  const result = solve([{ input, output }], input);
  assert.equal(result.inferred.program.name, 'repeat-periodic-recolor');
  assert.equal(gridEquals(result.output, output), true);
});

test('infers diagonal extrusion from a one-row seed', () => {
  const input = [[0,4,0,0,0]];
  const output = [
    [0,0,0,0,0],
    [0,0,0,0,4],
    [0,0,0,4,0],
    [0,0,4,0,0],
    [0,4,0,0,0],
  ];
  const result = solve([{ input, output }], input);
  assert.equal(result.inferred.program.name, 'diagonal-extrusion');
  assert.equal(gridEquals(result.output, output), true);
});

test('uses a marker run length to cycle palette columns', () => {
  const input = [
    [5,0,0,2,3],
    [5,0,0,2,3],
    [0,0,0,2,3],
    [0,0,0,2,3],
    [0,0,0,2,3],
    [0,0,0,2,3],
  ];
  const output = [
    [5,0,2,0,0],
    [5,0,2,0,0],
    [0,0,3,0,0],
    [0,0,3,0,0],
    [0,0,2,0,0],
    [0,0,2,0,0],
  ];
  const result = solve([{ input, output }], input);
  assert.equal(result.inferred.program.name, 'marker-palette-cycle');
  assert.equal(gridEquals(result.output, output), true);
});
