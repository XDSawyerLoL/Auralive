import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  sign,
  webcrypto,
} from 'node:crypto';

import {
  peerIdForJwk,
  peerResultFingerprint,
  publicIceServerView,
  stableStringify,
  verifyPeerEnvelope,
} from '../src/peer_mesh.js';

test('peer identity is deterministically derived from the public JWK', () => {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const first = peerIdForJwk(jwk);
  const second = peerIdForJwk({ ...jwk });
  assert.equal(first, second);
  assert.match(first, /^peer-[a-f0-9]{48}$/);
});

test('peer envelopes require a valid P-256 signature and fresh timestamp', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const envelope = {
    type: 'heartbeat',
    peer_id: peerIdForJwk(publicJwk),
    worker_id: 'mesh-test',
    capabilities: ['webrtc', 'webgpu'],
    resources: { webgpu: true },
    timestamp: Date.now(),
    nonce: 'nonce-test',
  };
  const signature = sign(
    'sha256',
    Buffer.from(stableStringify(envelope), 'utf8'),
    { key: privateKey, dsaEncoding: 'ieee-p1363' },
  ).toString('base64url');

  assert.equal(verifyPeerEnvelope(publicJwk, envelope, signature), true);
  assert.equal(
    verifyPeerEnvelope(publicJwk, { ...envelope, worker_id: 'tampered' }, signature),
    false,
  );
});

test('stableStringify recursively normalizes object key order', () => {
  assert.equal(
    stableStringify({ z: 1, a: { y: 2, b: 3 } }),
    stableStringify({ a: { b: 3, y: 2 }, z: 1 }),
  );
});


test('WebCrypto ECDSA signatures interoperate with the Node verifier used by browsers', async () => {
  const pair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const envelope = {
    type: 'register',
    peer_id: peerIdForJwk(publicJwk),
    worker_id: 'mesh-webcrypto',
    capabilities: ['webrtc', 'webgpu'],
    resources: { webgpu: true },
    timestamp: Date.now(),
    nonce: 'browser-shaped-nonce',
  };
  const signature = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.privateKey,
    new TextEncoder().encode(stableStringify(envelope)),
  );

  assert.equal(
    verifyPeerEnvelope(publicJwk, envelope, Buffer.from(signature).toString('base64url')),
    true,
  );
});


test('peer envelopes reject stale timestamps', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const envelope = {
    type: 'heartbeat',
    peer_id: peerIdForJwk(publicJwk),
    worker_id: 'mesh-stale',
    capabilities: ['webrtc'],
    resources: {},
    timestamp: 1,
    nonce: 'stale-nonce',
  };
  const signature = sign(
    'sha256',
    Buffer.from(stableStringify(envelope), 'utf8'),
    { key: privateKey, dsaEncoding: 'ieee-p1363' },
  ).toString('base64url');
  assert.equal(verifyPeerEnvelope(publicJwk, envelope, signature), false);
});


test('public ICE status never exposes TURN credentials', () => {
  const view = publicIceServerView([
    {
      urls: ['stun:stun.example.org:3478', 'turns:turn.example.org:5349'],
      username: 'private-user',
      credential: 'private-secret',
    },
  ]);
  const serialized = JSON.stringify(view);
  assert.equal(view[0].relay, true);
  assert.equal(view[0].credentialed, true);
  assert.equal(serialized.includes('private-user'), false);
  assert.equal(serialized.includes('private-secret'), false);
});

test('P2P quorum fingerprint tolerates insignificant Float32 drift', () => {
  const first = peerResultFingerprint({ value: [0.123456789, 0.333333343], engine: 'webgpu' });
  const second = peerResultFingerprint({ value: [0.123456791, 0.333333341], engine: 'webgpu' });
  const different = peerResultFingerprint({ value: [0.1234, 0.3333], engine: 'webgpu' });
  assert.equal(first, second);
  assert.notEqual(first, different);
});
