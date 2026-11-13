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
function memoryStorage() {
  const values = new Map();
  return {
    values,
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
    async remove(key) { values.delete(key); },
  };
}

test('refresh token and pending retry metadata are atomically stored as one secure value', async () => {
  const secureStorage = memoryStorage();
  const store = createTokenStore({ secureStorage });
  await store.saveTokenResponse(response());
  await store.savePendingRefreshAttempt({ refreshToken: token('r'), idempotencyKey: token('i') });
  const raw = secureStorage.values.get('nexira.session.state.v1');
  assert.deepEqual(JSON.parse(raw), {
    refreshToken: token('r'),
    pendingRefreshAttempt: { refreshToken: token('r'), idempotencyKey: token('i') },
  });
  assert.equal(secureStorage.values.has('nexira.session.refresh.v1'), false);
});

test('legacy secure refresh token is migrated to the versioned session state', async () => {
  const secureStorage = memoryStorage();
  secureStorage.values.set('nexira.session.refresh.v1', token('l'));
  const store = createTokenStore({ secureStorage });
  assert.equal(await store.getRefreshToken(), token('l'));
  assert.equal(secureStorage.values.has('nexira.session.refresh.v1'), false);
  assert.equal(JSON.parse(secureStorage.values.get('nexira.session.state.v1')).refreshToken, token('l'));
});

test('new token response clears pending attempt in the same secure write', async () => {
  const secureStorage = memoryStorage();
  const store = createTokenStore({ secureStorage });
  await store.saveTokenResponse(response());
  await store.savePendingRefreshAttempt({ refreshToken: token('r'), idempotencyKey: token('i') });
  await store.saveTokenResponse(response({ refreshToken: token('n') }));
  assert.deepEqual(JSON.parse(secureStorage.values.get('nexira.session.state.v1')), {
    refreshToken: token('n'), pendingRefreshAttempt: null,
  });
});

test('invalid secure state fails closed and is not overwritten', async () => {
  const secureStorage = memoryStorage();
  secureStorage.values.set('nexira.session.state.v1', '{broken');
  const store = createTokenStore({ secureStorage });
  await assert.rejects(store.getSessionState(), /Secure session state is invalid/);
  assert.equal(secureStorage.values.get('nexira.session.state.v1'), '{broken');
});

test('secure write failure prevents access token from being exposed', async () => {
  const secureStorage = memoryStorage();
  secureStorage.set = async () => { throw new Error('keystore unavailable'); };
  const store = createTokenStore({ secureStorage });
  await assert.rejects(store.saveTokenResponse(response()), /keystore unavailable/);
  assert.equal(store.getAccessToken(), null);
});

test('without a secure adapter refresh tokens are never persisted', async () => {
  const store = createTokenStore();
  assert.deepEqual(await store.saveTokenResponse(response()), { persisted: false });
  assert.equal(store.getAccessToken(), 'short-lived-access-token');
  assert.equal(await store.getRefreshToken(), null);
  assert.equal(store.hasPersistentRefreshStorage(), false);
});

test('invalid token response does not change current access token', async () => {
  const store = createTokenStore();
  await store.saveTokenResponse(response());
  await assert.rejects(store.saveTokenResponse(response({ refreshToken: 'invalid' })), /invalid session token response/);
  assert.equal(store.getAccessToken(), 'short-lived-access-token');
});

test('expired access token is discarded from memory', async () => {
  const store = createTokenStore();
  await store.saveTokenResponse(response({ accessTokenExpiresAt: '2000-01-01T00:00:00.000Z' }));
  assert.equal(store.getAccessToken(), null);
});

test('invalid pending refresh metadata fails closed instead of generating a new rotation attempt', async () => {
  const secureStorage = memoryStorage();
  secureStorage.values.set('nexira.session.state.v1', JSON.stringify({
    refreshToken: token('r'),
    pendingRefreshAttempt: { refreshToken: token('x'), idempotencyKey: token('i') },
  }));
  const store = createTokenStore({ secureStorage });
  await assert.rejects(store.getSessionState(), /Pending refresh metadata is invalid/);
  assert.equal(JSON.parse(secureStorage.values.get('nexira.session.state.v1')).refreshToken, token('r'));
});
