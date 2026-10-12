import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const server=fs.readFileSync(new URL('../src/server.js', import.meta.url),'utf8');
test('public build and capabilities handlers import the real native cognition engine',()=>{
  assert.match(server,/import \{ CognitionEngine \} from '\.\/cognition\.js';/);
  assert.match(server,/cognition: CognitionEngine\.VERSION/);
  assert.match(server,/native_dialogue_version: CognitionEngine\.VERSION/);
});
