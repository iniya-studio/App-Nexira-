import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleAuthAdapter } from './googleAuth.js';

function cryptoStub() {
  return {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index + 1;
      return bytes;
    },
  };
}

const validClientId = 'nexira-web.apps.googleusercontent.com';

test('native Google adapter requests an ID token with a cryptographically generated nonce', async () => {
  const calls = [];
  const adapter = createGoogleAuthAdapter({
    platform: () => 'android',
    clientId: validClientId,
    cryptoObject: cryptoStub(),
    plugin: { async signIn(args) { calls.push(args); return { idToken: 'x'.repeat(120) }; } },
  });
  const token = await adapter.getIdToken();
  assert.equal(token, 'x'.repeat(120));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].serverClientId, validClientId);
  assert.match(calls[0].nonce, /^[A-Za-z0-9_-]{43}$/);
});

test('native Google adapter rejects missing or malformed OAuth client configuration', async () => {
  const adapter = createGoogleAuthAdapter({
    platform: () => 'android',
    clientId: 'not-a-client-id',
    cryptoObject: cryptoStub(),
    plugin: { async signIn() { throw new Error('must not be called'); } },
  });
  await assert.rejects(adapter.getIdToken(), /not configured yet/);
});

test('native Google adapter is Android-only and does not fall back to web OAuth', async () => {
  const adapter = createGoogleAuthAdapter({
    platform: () => 'web',
    clientId: validClientId,
    cryptoObject: cryptoStub(),
    plugin: { async signIn() { throw new Error('must not be called'); } },
  });
  await assert.rejects(adapter.getIdToken(), /Android only/);
});

test('native Google adapter rejects an empty or malformed ID token', async () => {
  const adapter = createGoogleAuthAdapter({
    platform: () => 'android',
    clientId: validClientId,
    cryptoObject: cryptoStub(),
    plugin: { async signIn() { return { idToken: 'short' }; } },
  });
  await assert.rejects(adapter.getIdToken(), /valid identity token/);
});

test('native Google adapter exposes cancellation without leaking credentials', async () => {
  let cancelled = false;
  const adapter = createGoogleAuthAdapter({
    platform: () => 'android',
    clientId: validClientId,
    cryptoObject: cryptoStub(),
    plugin: { async cancel() { cancelled = true; } },
  });
  await adapter.cancel();
  assert.equal(cancelled, true);
});
