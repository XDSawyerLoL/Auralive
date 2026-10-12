import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedArtifactRedirect, noexecMount, nativeProvisionSupported,
  EmbeddedProvisioner } from '../src/embedded_provisioner.js';

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
