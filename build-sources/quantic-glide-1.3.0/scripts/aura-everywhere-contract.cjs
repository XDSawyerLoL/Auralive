'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  AuraEverywherePresence,
  cleanCloudUrl,
} = (() => {
  const mod = require('../src/services/aura-everywhere.cjs');
  return { ...mod, cleanCloudUrl: mod.cleanCloudUrl };
})();

const main = fs.readFileSync(path.join(__dirname,'..','src','main.cjs'),'utf8');
const presence = fs.readFileSync(path.join(__dirname,'..','src','services','aura-everywhere.cjs'),'utf8');

assert.doesNotThrow(() => new AuraEverywherePresence({
  fetchImpl: async () => ({ ok:true, text: async () => '{}' }),
  token:'',
  baseUrl:'not-a-valid-url',
}));
assert.equal(cleanCloudUrl('http://[::1]:8787'), 'http://[::1]:8787');
assert.match(presence, /\/api\/aura\/products\/register/);
assert.match(presence, /quantic-glide/);
assert.match(presence, /!this\.enabled \|\| !this\.canSend\(\)/);
assert.match(main, /canSend:\s*\(\) => !isPrivateMode\(\)/);
console.log('AURA Everywhere Glide contract: OK');
