import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('public chat receives safe operational activity instead of an empty agenda', () => {
  const kernel = fs.readFileSync(new URL('../src/kernel.js', import.meta.url), 'utf8');
  assert.match(kernel, /async publicAgendaSnapshot\(\)/);
  assert.match(kernel, /async publicWorkItems\(limit = 5\)/);
  assert.match(kernel, /privateView \? this\.workItems\(5\) : this\.publicWorkItems\(5\)/);
  assert.match(kernel, /privateView \? this\.agendaSnapshot\(\) : this\.publicAgendaSnapshot\(\)/);
  assert.match(kernel, /kind IN \('github','evolution','research'\)/);
});

test('architecture endpoint reports current unified homeostasis version', () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(server, /organism: 'homeostasie_v9_unified'/);
  assert.doesNotMatch(server, /organism: 'homeostasie_v7_streamlined'/);
});
