import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  sign,
} from 'node:crypto';

import {
  peerIdForJwk,
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
