import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleAuthAdapter } from './googleAuth.js';

const validClientId = 'nexira-web.apps.googleusercontent.com';
const validNonce = 'n'.repeat(43);

test('native Google adapter sends the server-issued nonce to Credential Manager', async () => {
  const calls = [];
  const adapter = createGoogleAuthAdapter({
    platform: () => 'android',
    clientId: validClientId,
    plugin: { async signIn(args) { calls.push(args); return { idToken: 'x'.repeat(120) }; } },
  });
  const identity = await adapter.getIdentity(validNonce);
  assert.equal(identity.idToken, 'x'.repeat(120));
  assert.equal(identity.nonce, validNonce);
  assert.deepEqual(calls, [{ serverClientId: validClientId, nonce: validNonce }]);
});

test('native Google adapter rejects missing or malformed OAuth client configuration', async () => {
  const adapter = createGoogleAuthAdapter({
    platform: () => 'android',
    clientId: 'not-a-client-id',
    plugin: { async signIn() { throw new Error('must not be called'); } },
  });
  await assert.rejects(adapter.getIdentity(validNonce), /not configured yet/);
});

test('native Google adapter is Android-only and does not fall back to web OAuth', async () => {
  const adapter = createGoogleAuthAdapter({
    platform: () => 'web',
    clientId: validClientId,
    plugin: { async signIn() { throw new Error('must not be called'); } },
  });
  await assert.rejects(adapter.getIdentity(validNonce), /Android only/);
});

test('native Google adapter rejects an invalid or missing server challenge', async () => {
  const adapter = createGoogleAuthAdapter({
    platform: () => 'android',
    clientId: validClientId,
    plugin: { async signIn() { throw new Error('must not be called'); } },
  });
  await assert.rejects(adapter.getIdentity(''), /one-time Google sign-in challenge/);
  await assert.rejects(adapter.getIdentity('x'.repeat(42)), /one-time Google sign-in challenge/);
});

test('native Google adapter rejects an empty or malformed ID token', async () => {
  const adapter = createGoogleAuthAdapter({
    platform: () => 'android',
    clientId: validClientId,
    plugin: { async signIn() { return { idToken: 'short' }; } },
  });
  await assert.rejects(adapter.getIdentity(validNonce), /valid identity token/);
});

test('native Google adapter exposes cancellation without leaking credentials', async () => {
  let cancelled = false;
  const adapter = createGoogleAuthAdapter({
    platform: () => 'android',
    clientId: validClientId,
    plugin: { async cancel() { cancelled = true; } },
  });
  await adapter.cancel();
  assert.equal(cancelled, true);
});
