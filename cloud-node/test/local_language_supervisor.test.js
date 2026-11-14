import test from 'node:test';
import assert from 'node:assert/strict';
import {localLanguageRecoveryDecision,localLanguageRetryAfter}
 from '../src/local_language_supervisor.js';
import {shouldWarmInstalledLanguage,independentLocalLanguageBoot}
 from '../src/embedded_language.js';

const BASE={warmup:true,localOnly:true,ready:false,booting:false,
  installed:false,canProvision:true,now:100000,cooldownUntil:0,
  provisionRetryAfter:0};

test('automatic local GGUF installation is eligible even without NODE_ENV',()=>{
 assert.equal(shouldWarmInstalledLanguage({
  CI:'',NODE_ENV:'',AURA_EMBEDDED_LANGUAGE_ENABLED:'true'
 }),true);
 const boot=independentLocalLanguageBoot({
  warmup:true,installed:false,autoprovisionEnabled:true,canProvision:true});
 assert.equal(boot.start,true);
 assert.equal(boot.allowProvision,true);
 const decision=localLanguageRecoveryDecision(BASE);
 assert.deepEqual({start:decision.start,allowProvision:decision.allowProvision},
  {start:true,allowProvision:true});
});
test('the supervised runtime does not start concurrent model downloads',()=>{
 assert.equal(localLanguageRecoveryDecision({...BASE,booting:true}).start,false);
 assert.equal(localLanguageRecoveryDecision({...BASE,ready:true}).start,false);
 assert.equal(localLanguageRecoveryDecision({...BASE,localOnly:false}).start,false);
 assert.equal(localLanguageRecoveryDecision({...BASE,warmup:false}).start,false);
 assert.equal(localLanguageRecoveryDecision({...BASE,canProvision:false}).start,false);
});
test('after cooldown the model retries; before cooldown it waits',()=>{
 const blocked=localLanguageRecoveryDecision({
  ...BASE,now:110000,cooldownUntil:120000});
 assert.equal(blocked.start,false);
 assert.equal(blocked.reason,'retry-cooldown');
 assert.equal(localLanguageRecoveryDecision({...BASE,now:120000,cooldownUntil:120000}).start,true);
 const date='2026-11-14T12:10:00.000Z';
 assert.equal(localLanguageRetryAfter({retry_after:date}),Date.parse(date));
 assert.equal(localLanguageRetryAfter({retry_after:'not-a-date'}),0);
 assert.equal(localLanguageRecoveryDecision({
  ...BASE,now:Date.parse(date)-1000,provisionRetryAfter:Date.parse(date)
 }).start,false);
 assert.equal(localLanguageRecoveryDecision({
  ...BASE,now:Date.parse(date)+1000,provisionRetryAfter:Date.parse(date)
 }).start,true);
});
test('hard host security blocks cannot be retried silently',()=>{
 for(const failureCode of [
  'host-disallows-native-execution','embedded-incompatible-binary',
  'embedded-cpu-instruction-unsupported','embedded-unsupported-startup-option'
 ]){
  const r=localLanguageRecoveryDecision({...BASE,installed:true,failureCode});
  assert.equal(r.start,false,failureCode);
  assert.equal(r.retryable,false,failureCode);
  assert.equal(r.reason,'requires-host-intervention');
 }
});
test('already installed model can start without provisioning enabled',()=>{
 const r=localLanguageRecoveryDecision({...BASE,installed:true,canProvision:false});
 assert.equal(r.start,true);
 assert.equal(r.allowProvision,false);
 assert.equal(r.reason,'retry-native-start');
});
