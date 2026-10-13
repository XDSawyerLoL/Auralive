import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddedBackgroundAllowed} from '../src/ai.js';

test('production Qwen is reserved for French conversation by default',()=>{
  assert.equal(embeddedBackgroundAllowed({NODE_ENV:'production'}),false);
  assert.equal(embeddedBackgroundAllowed({NODE_ENV:'production',CI:'false'}),false);
  assert.equal(embeddedBackgroundAllowed({NODE_ENV:'production',AURA_EMBEDDED_BACKGROUND_ENABLED:'true'}),true);
  assert.equal(embeddedBackgroundAllowed({NODE_ENV:'production',AURA_EMBEDDED_BACKGROUND_ENABLED:'false'}),false);
  assert.equal(embeddedBackgroundAllowed({NODE_ENV:'test'}),true);
  assert.equal(embeddedBackgroundAllowed({NODE_ENV:'production',CI:'true'}),true);
});
