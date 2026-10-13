import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { allowedArtifactRedirect, noexecMount, nativeProvisionSupported,
  EmbeddedProvisioner, hasLibraries, installBundledStaticServer,
  selectEmbeddedModelVariant,EMBEDDED_GGUF_MODELS } from '../src/embedded_provisioner.js';

test('trusts official HTTPS release / model hosts and forbids other endpoints',()=>{
  assert.equal(allowedArtifactRedirect('https://github.com/ggml-org/llama.cpp/releases','binary'),true);
  assert.equal(allowedArtifactRedirect('https://release-assets.githubusercontent.com/blob','binary'),true);
  assert.equal(allowedArtifactRedirect('http://github.com/x','binary'),false);
  assert.equal(allowedArtifactRedirect('https://untrusted.example/weights','model'),false);
  assert.equal(allowedArtifactRedirect('https://huggingface.co/Qwen/Qwen3-0.6B-GGUF','model'),true);
  assert.equal(allowedArtifactRedirect('https://cdn-lfs.hf.co/token','model'),true);
  assert.equal(allowedArtifactRedirect('https://attacker.example.xethub.hf.co/resource','model'),true);
});
test('matches longest Linux mount, even when /tmp has noexec',()=>{
  const info=[
    '1 0 8:1 / / rw,relatime - ext4 /dev/sda1 rw',
    '2 1 8:1 /tmp /tmp rw,nosuid,nodev,noexec - ext4 /dev/sda1 rw',
  ].join('\n');
  assert.equal(noexecMount('/tmp/llama-server',info),true);
  assert.equal(noexecMount('/home/user/aura',info),false);
});
test('only Linux CPU architectures are supported',()=>{
  assert.equal(nativeProvisionSupported('linux','x64'),true);
  assert.equal(nativeProvisionSupported('linux','arm64'),true);
  assert.equal(nativeProvisionSupported('win32','x64'),false);
});
test('explicit opt-out refuses installation and cannot contact paid providers',async()=>{
  const prior=process.env.AURA_EMBEDDED_AUTOPROVISION_ENABLED;
  process.env.AURA_EMBEDDED_AUTOPROVISION_ENABLED='false';
  const p=new EmbeddedProvisioner({request:()=>{throw Error('unexpected network');}});
  try{
    assert.equal(p.enabled,false);
    assert.equal(await p.ensure(),null);
    assert.equal(p.snapshot().no_paid_api,true);
  }finally{
    if(prior===undefined)delete process.env.AURA_EMBEDDED_AUTOPROVISION_ENABLED;
    else process.env.AURA_EMBEDDED_AUTOPROVISION_ENABLED=prior;
  }
});

test('official region-specific CDN and object-store redirects remain SHA-256 checked',()=>{
  assert.equal(allowedArtifactRedirect('https://cdn-lfs-us-1.hf.co/path','model'),true);
  assert.equal(allowedArtifactRedirect('https://cas-bridge.xethub.hf.co/blob','model'),true);
  assert.equal(allowedArtifactRedirect('https://hf-bucket.storage.googleapis.com/x','model'),true);
  assert.equal(allowedArtifactRedirect('https://github-production-release-asset-2e65be.s3.amazonaws.com/asset','binary'),true);
  assert.equal(allowedArtifactRedirect('https://release-assets.githubusercontent.com/asset','binary'),true);
  assert.equal(allowedArtifactRedirect('https://attacker-hf.co/asset','model'),false);
  assert.equal(allowedArtifactRedirect('http://storage.googleapis.com/asset','model'),false);
  assert.equal(allowedArtifactRedirect('https://evil.amazonaws.com/asset','binary'),false);
});

test('provisioning never counts a dangling library symlink as a verified native runtime',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aura-native-provision-'));
  try{
    fs.symlinkSync('llama-b11425ibllama-common.so.0.0.11425',
      path.join(root,'libllama-common.so.0'));
    fs.symlinkSync('llama-b11425ibggml.so.0.11.1',
      path.join(root,'libggml.so.0'));
    assert.equal(await hasLibraries(root),false);
    fs.writeFileSync(path.join(root,'libllama-common.so.0.0.11425'),'native-file');
    fs.writeFileSync(path.join(root,'libggml.so.0.11.1'),'native-file');
    assert.equal(await hasLibraries(root),true);
  }finally{fs.rmSync(root,{force:true,recursive:true});}
});

test('standalone musl Linux payload is copied, verified, and executable without any .so',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aura-musl-fixture-'));
  try{
    const packageDir=path.join(root,'node','native','linux-x64');
    const cache=path.join(root,'cache');
    fs.mkdirSync(packageDir,{recursive:true});
    fs.mkdirSync(cache);
    const binary=path.join(packageDir,'llama-server');
    fs.writeFileSync(binary,'#!/bin/sh\nprintf "STATIC_OK\\n"\n',{mode:0o644});
    const expected=createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
    fs.writeFileSync(path.join(packageDir,'llama-server.sha256'),expected+'\n');
    const result=await installBundledStaticServer(cache,{
      root:path.join(root,'node'),platform:'linux',arch:'x64',
    });
    assert.ok(result.includes('standalone-musl-b11425'));
    assert.equal(fs.readFileSync(result,'utf8'),fs.readFileSync(binary,'utf8'));
    assert.equal(fs.statSync(result).mode&0o100,0o100);
    assert.equal(fs.existsSync(path.join(path.dirname(result),'libllama-common.so.0')),false);
    assert.equal(await installBundledStaticServer(cache,{
      root:path.join(root,'node'),platform:'win32',arch:'x64',
    }),'');
    fs.writeFileSync(binary,'tampered');
    await assert.rejects(()=>installBundledStaticServer(cache,{
      root:path.join(root,'node'),platform:'linux',arch:'x64',
    }),/embedded-static-sha256-mismatch/);
  }finally{fs.rmSync(root,{force:true,recursive:true});}
});

test('AURA GGUF selection is stable by default and the Q4 canary is pinned',()=>{
  assert.equal(selectEmbeddedModelVariant(), 'qwen3-q8');
  assert.equal(selectEmbeddedModelVariant('wrong-model'), 'qwen3-q8');
  assert.equal(selectEmbeddedModelVariant('qwen3-q8'), 'qwen3-q8');
  assert.equal(selectEmbeddedModelVariant('qwen3-q4-canary'), 'qwen3-q4-canary');
  const stable=EMBEDDED_GGUF_MODELS['qwen3-q8'];
  const canary=EMBEDDED_GGUF_MODELS['qwen3-q4-canary'];
  assert.equal(stable.filename,'Qwen3-0.6B-Q8_0.gguf');
  assert.equal(canary.filename,'Qwen3-0.6B-Q4_K_M.gguf');
  assert.equal(canary.sha256,'ac2d97712095a558e31573f62f466a3f9d93990898b0ec79d7c974c1780d524a');
  assert.match(canary.url,/^https:\/\/huggingface\.co\/unsloth\/Qwen3-0\.6B-GGUF\//);
  assert.notEqual(canary.filename,stable.filename);
  assert.ok(canary.maxBytes<stable.maxBytes);
  assert.equal(new EmbeddedProvisioner({settings:{modelVariant:'qwen3-q8'}}).snapshot().model_variant,'qwen3-q8');
  const instance=new EmbeddedProvisioner({settings:{modelVariant:'qwen3-q4-canary'}});
  assert.equal(instance.snapshot().model_variant,'qwen3-q4-canary');
  assert.equal(instance.snapshot().canary_rollback_available,false);
  assert.match(instance.snapshot().model,/Q4_K_M/);
});
