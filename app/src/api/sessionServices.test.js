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


test('invalid refresh credentials notify the session owner after clearing local credentials', async () => {
  const storage = secureStorage();
  const invalidations = [];
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
  const services = createSessionServices({
    platform: 'android',
    baseUrl: 'https://api.example.test/api/v1',
    secureStorage: storage,
    onSessionInvalidated: (error) => invalidations.push(error.status),
    fetchImpl: async (url, options) => {
      if (url.endsWith('/guest/start')) return new Response(JSON.stringify(initial), { status: 201 });
      if (url.endsWith('/profile/me')) return new Response(JSON.stringify({ message: 'Expired' }), { status: 401 });
      if (url.endsWith('/sessions/refresh')) return new Response(JSON.stringify({ message: 'Refresh revoked' }), { status: 401 });
      return new Response(JSON.stringify({ message: 'Unexpected request' }), { status: 500 });
    },
  });

  await services.coordinator.startGuest();
  await assert.rejects(services.http.get('/profile/me'), (error) => error.status === 401);
  assert.deepEqual(invalidations, [401]);
  assert.equal(services.tokenStore.getAccessToken(), null);
  assert.equal(await services.tokenStore.getRefreshToken(), null);
  assert.equal(services.coordinator.getCurrentPrincipal(), null);
  assert.equal(services.coordinator.getCurrentSession(), null);
});


test('lifecycle logout aborts a real composed HTTP profile request end to end', async () => {
  const storage = secureStorage();
  const initial = {
    principal: { principalType: 'GUEST', principalId: 'guest-1' },
    session: { sessionId: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
    tokens: {
      accessToken: 'access-token',
      accessTokenExpiresAt: '2030-01-01T00:05:00.000Z',
      refreshToken: 'r'.repeat(43),
      refreshTokenExpiresAt: '2030-01-08T00:00:00.000Z',
    },
  };
  let profileSignal = null;
  const fetchImpl = async (url, options) => {
    if (url.endsWith('/guest/start')) return new Response(JSON.stringify(initial), { status: 201 });
    if (url.endsWith('/profile/me')) {
      profileSignal = options.signal;
      return new Promise((resolve, reject) => {
        const abort = () => reject(new Error('profile request aborted'));
        if (options.signal.aborted) abort();
        else options.signal.addEventListener('abort', abort, { once: true });
      });
    }
    if (url.endsWith('/sessions/logout')) return new Response(JSON.stringify({ success: true }), { status: 200 });
    return new Response(JSON.stringify({ message: 'Unexpected request' }), { status: 500 });
  };
  const { createSessionLifecycle } = await import('./sessionLifecycle.js');
  const lifecycle = createSessionLifecycle({
    platform: () => 'android',
    createServices: (options) => createSessionServices({
      platform: 'android',
      baseUrl: 'https://api.example.test/api/v1',
      secureStorage: storage,
      fetchImpl,
      ...options,
    }),
  });

  await lifecycle.initialize();
  const loading = lifecycle.loadAccountData();
  for (let i = 0; i < 20 && !profileSignal; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.ok(profileSignal);
  assert.equal(profileSignal.aborted, false);

  await lifecycle.logout();
  assert.equal(profileSignal.aborted, true);
  assert.equal((await loading).status, 'signed-out');
  assert.equal(lifecycle.getState().profile, null);
});


test('lifecycle-managed HTTP client aborts progression, match and matchmaking requests on logout', async () => {
  const storage = secureStorage();
  const initial = {
    principal: { principalType: 'GUEST', principalId: 'guest-1' },
    session: { sessionId: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
    tokens: {
      accessToken: 'access-token',
      accessTokenExpiresAt: '2030-01-01T00:05:00.000Z',
      refreshToken: 'r'.repeat(43),
      refreshTokenExpiresAt: '2030-01-08T00:00:00.000Z',
    },
  };
  const activeSignals = [];
  const fetchImpl = async (url, options) => {
    if (url.endsWith('/guest/start')) return new Response(JSON.stringify(initial), { status: 201 });
    if (url.endsWith('/sessions/logout')) return new Response(JSON.stringify({ success: true }), { status: 200 });
    if (/\/(progression\/me|matches\/ai|matchmaking\/queue\/me)$/.test(url)) {
      activeSignals.push(options.signal);
      return new Promise((resolve, reject) => {
        const abort = () => reject(new Error('request aborted'));
        if (options.signal.aborted) abort();
        else options.signal.addEventListener('abort', abort, { once: true });
      });
    }
    return new Response(JSON.stringify({ message: 'Unexpected request' }), { status: 500 });
  };
  const { createSessionLifecycle } = await import('./sessionLifecycle.js');
  const { createProgressionApi } = await import('./progressionApi.js');
  const { createMatchApi } = await import('./matchApi.js');
  const { createMatchmakingApi } = await import('./matchmakingApi.js');
  const lifecycle = createSessionLifecycle({
    platform: () => 'android',
    createServices: (options) => createSessionServices({
      platform: 'android',
      baseUrl: 'https://api.example.test/api/v1',
      secureStorage: storage,
      fetchImpl,
      ...options,
    }),
  });

  await lifecycle.initialize();
  const http = lifecycle.getHttpClient();
  const requests = [
    createProgressionApi(http).getMyProgress(),
    createMatchApi(http).createAiMatch({ category: 'general', language: 'en' }),
    createMatchmakingApi(http).cancel(),
  ];
  for (let i = 0; i < 30 && activeSignals.length < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(activeSignals.length, 3);
  assert.ok(activeSignals.every((signal) => signal.aborted === false));

  await lifecycle.logout();
  assert.ok(activeSignals.every((signal) => signal.aborted === true));
  const outcomes = await Promise.allSettled(requests);
  assert.ok(outcomes.every((outcome) => outcome.status === 'rejected'
    && outcome.reason.code === 'REQUEST_ABORTED'));
});


test('HTTP API clients from a previous identity cannot issue requests after account switch', async () => {
  const storage = secureStorage();
  const guest = {
    principal: { principalType: 'GUEST', principalId: 'guest-1' },
    session: { sessionId: 'guest-session', expiresAt: '2030-01-01T00:00:00.000Z' },
    tokens: {
      accessToken: 'guest-access-token',
      accessTokenExpiresAt: '2030-01-01T00:05:00.000Z',
      refreshToken: 'r'.repeat(43),
      refreshTokenExpiresAt: '2030-01-08T00:00:00.000Z',
    },
  };
  const user = {
    principal: { principalType: 'USER', principalId: 'user-1' },
    session: { sessionId: 'user-session', expiresAt: '2030-01-01T00:00:00.000Z' },
    tokens: {
      accessToken: 'user-access-token',
      accessTokenExpiresAt: '2030-01-01T00:05:00.000Z',
      refreshToken: 'n'.repeat(43),
      refreshTokenExpiresAt: '2030-01-08T00:00:00.000Z',
    },
    user: { id: 'user-1', email: 'player@example.com' },
  };
  let progressionRequests = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith('/guest/start')) return new Response(JSON.stringify(guest), { status: 201 });
    if (url.endsWith('/auth/login')) return new Response(JSON.stringify(user), { status: 200 });
    if (url.endsWith('/progression/me')) {
      progressionRequests += 1;
      return new Response(JSON.stringify({ totalXp: 0, level: 1 }), { status: 200 });
    }
    return new Response(JSON.stringify({ message: 'Unexpected request' }), { status: 500 });
  };
  const { createSessionLifecycle } = await import('./sessionLifecycle.js');
  const { createProgressionApi } = await import('./progressionApi.js');
  const lifecycle = createSessionLifecycle({
    platform: () => 'android',
    createServices: (options) => createSessionServices({
      platform: 'android',
      baseUrl: 'https://api.example.test/api/v1',
      secureStorage: storage,
      fetchImpl,
      ...options,
    }),
  });

  await lifecycle.initialize();
  const guestApi = createProgressionApi(lifecycle.getHttpClient());
  await lifecycle.login({ email: 'player@example.com', password: 'correct-password' });

  await assert.rejects(
    guestApi.getMyProgress(),
    (error) => error.code === 'SESSION_SUPERSEDED',
  );
  assert.equal(progressionRequests, 0);

  const userApi = createProgressionApi(lifecycle.getHttpClient());
  await userApi.getMyProgress();
  assert.equal(progressionRequests, 1);
});
