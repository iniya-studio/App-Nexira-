import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenStore } from './tokenStore.js';

const token = (character) => character.repeat(43);
function response(overrides = {}) {
  return {
    principal: { principalType: 'GUEST', principalId: 'guest-id' },
    session: { sessionId: 'session-id', expiresAt: '2030-01-01T00:00:00.000Z' },
    tokens: {
      accessToken: 'short-lived-access-token',
      accessTokenExpiresAt: '2030-01-01T00:05:00.000Z',
      refreshToken: token('r'),
      refreshTokenExpiresAt: '2030-01-08T00:00:00.000Z',
      ...overrides,
    },
  };
}

test('access token remains memory-only and refresh token uses only injected secure storage', async () => {
  const values = new Map();
  const calls = [];
  const secureStorage = {
    async get(key) { calls.push(['get', key]); return values.get(key) ?? null; },
    async set(key, value) { calls.push(['set', key]); values.set(key, value); },
    async remove(key) { calls.push(['remove', key]); values.delete(key); },
  };
  const store = createTokenStore({ secureStorage });

  assert.deepEqual(await store.saveTokenResponse(response()), { persisted: true });
  assert.equal(store.getAccessToken(), 'short-lived-access-token');
  assert.equal(await store.getRefreshToken(), token('r'));
  assert.equal(values.has('nexira.session.refresh.v1'), true);
  assert.equal(calls.some(([method]) => method === 'set'), true);
  await store.clear();
  assert.equal(store.getAccessToken(), null);
  assert.equal(await store.getRefreshToken(), null);
});

test('without a secure adapter, refresh tokens are never persisted', async () => {
  const store = createTokenStore();
  assert.deepEqual(await store.saveTokenResponse(response()), { persisted: false });
  assert.equal(store.getAccessToken(), 'short-lived-access-token');
  assert.equal(await store.getRefreshToken(), null);
  assert.equal(store.hasPersistentRefreshStorage(), false);
});

test('invalid token response is rejected without changing current access token', async () => {
  const store = createTokenStore();
  await store.saveTokenResponse(response());
  await assert.rejects(
    store.saveTokenResponse(response({ refreshToken: 'not-a-high-entropy-token' })),
    /invalid session token response/,
  );
  assert.equal(store.getAccessToken(), 'short-lived-access-token');
});

test('expired access token is discarded from memory', async () => {
  const store = createTokenStore();
  await store.saveTokenResponse(response({
    accessTokenExpiresAt: '2000-01-01T00:00:00.000Z',
  }));
  assert.equal(store.getAccessToken(), null);
});
