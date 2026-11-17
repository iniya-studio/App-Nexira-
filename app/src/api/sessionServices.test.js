import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionServices } from './sessionServices.js';

function secureStorage() {
  const values = new Map();
  return {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
    async remove(key) { values.delete(key); },
  };
}

test('session services compose native storage, API, HTTP client, and coordinator', () => {
  const services = createSessionServices({
    platform: 'android',
    baseUrl: 'https://api.example.test/api/v1/',
    secureStorage: secureStorage(),
    fetchImpl: async () => { throw new Error('network should not be called during composition'); },
  });
  assert.equal(typeof services.tokenStore.getAccessToken, 'function');
  assert.equal(typeof services.sessionApi.startGuest, 'function');
  assert.equal(typeof services.coordinator.startGuest, 'function');
  assert.equal(typeof services.http.post, 'function');
  assert.equal(Object.isFrozen(services), true);
});

test('persistent sessions are disabled on platforms without a native secure adapter', () => {
  assert.throws(
    () => createSessionServices({ platform: 'web', baseUrl: 'https://api.example.test', secureStorage: secureStorage() }),
    /Android only/,
  );
  assert.throws(
    () => createSessionServices({ platform: 'ios', baseUrl: 'https://api.example.test', secureStorage: secureStorage() }),
    /Android only/,
  );
});

test('session services reject missing API configuration and secure storage', () => {
  assert.throws(
    () => createSessionServices({ platform: 'android', baseUrl: '', secureStorage: secureStorage() }),
    /API base URL/,
  );
  assert.throws(
    () => createSessionServices({ platform: 'android', baseUrl: 'https://api.example.test', secureStorage: null }),
    /Native secure storage is required/,
  );
});


test('composed session services refresh and retry a protected request after backend 401', async () => {
  const values = new Map();
  const storage = {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
    async remove(key) { values.delete(key); },
  };
  const initial = {
    principal: { principalType: 'GUEST', principalId: 'guest-1' },
    session: { sessionId: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
    tokens: {
      accessToken: 'old-access-token',
      accessTokenExpiresAt: '2030-01-01T00:05:00.000Z',
      refreshToken: 'r'.repeat(43),
      refreshTokenExpiresAt: '2030-01-08T00:00:00.000Z',
    },
  };
  const rotated = {
    ...initial,
    tokens: {
      ...initial.tokens,
      accessToken: 'new-access-token',
      refreshToken: 'n'.repeat(43),
    },
  };
  const requests = [];
  const services = createSessionServices({
    platform: 'android',
    baseUrl: 'https://api.example.test/api/v1',
    secureStorage: storage,
    fetchImpl: async (url, options) => {
      requests.push({ url, authorization: options.headers.get('Authorization'), body: options.body });
      if (url.endsWith('/guest/start')) {
        return new Response(JSON.stringify(initial), { status: 201 });
      }
      if (url.endsWith('/sessions/refresh')) {
        return new Response(JSON.stringify(rotated), { status: 200 });
      }
      if (url.endsWith('/profile/me') && options.headers.get('Authorization') === 'Bearer old-access-token') {
        return new Response(JSON.stringify({ message: 'Expired', code: 'AUTH_EXPIRED' }), { status: 401 });
      }
      if (url.endsWith('/profile/me') && options.headers.get('Authorization') === 'Bearer new-access-token') {
        return new Response(JSON.stringify({ profile: { displayName: 'Player One' } }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: 'Unexpected request' }), { status: 500 });
    },
  });

  await services.coordinator.startGuest();
  const result = await services.http.get('/profile/me');

  assert.deepEqual(result, { profile: { displayName: 'Player One' } });
  assert.deepEqual(requests.map((request) => request.authorization), [
    null,
    'Bearer old-access-token',
    null,
    'Bearer new-access-token',
  ]);
  assert.equal(requests.filter((request) => request.url.endsWith('/sessions/refresh')).length, 1);
  assert.equal(await services.tokenStore.getRefreshToken(), 'n'.repeat(43));
});
