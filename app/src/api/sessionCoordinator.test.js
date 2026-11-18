import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from './httpClient.js';
import { createSessionCoordinator } from './sessionCoordinator.js';
import { createTokenStore } from './tokenStore.js';

const token = (character) => character.repeat(43);
function sessionResponse(principalType = 'GUEST', refresh = token('r')) {
  return {
    principal: { principalType, principalId: 'principal-1' },
    session: { sessionId: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
    tokens: { accessToken: 'access-token', accessTokenExpiresAt: '2030-01-01T00:05:00.000Z',
      refreshToken: refresh, refreshTokenExpiresAt: '2030-01-08T00:00:00.000Z' },
  };
}
function memoryStorage() {
  const values = new Map();
  return { values, async get(k) { return values.get(k) ?? null; },
    async set(k,v) { values.set(k,v); }, async remove(k) { values.delete(k); } };
}
function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function makeStore(initialRefresh = null, storage = memoryStorage()) {
  const store = createTokenStore({ secureStorage: storage });
  return { ...store, storage, initialize: async () => {
    if (initialRefresh) await store.saveTokenResponse(sessionResponse('GUEST', initialRefresh));
  }};
}

test('guest start stores session credentials and principal', async () => {
  const store = makeStore(); const response = sessionResponse();
  const coordinator = createSessionCoordinator({ sessionApi: { startGuest: async () => response }, tokenStore: store });
  await coordinator.startGuest();
  assert.equal(store.getAccessToken(), 'access-token');
  assert.equal(coordinator.getCurrentPrincipal().principalType, 'GUEST');
});

test('concurrent refresh calls share one backend rotation request', async () => {
  const store = makeStore(token('o')); await store.initialize();
  const gate = deferred(); let calls = 0;
  const coordinator = createSessionCoordinator({
    sessionApi: { refresh: async (refreshToken, key) => {
      calls++; assert.equal(refreshToken, token('o')); assert.equal(key, token('i')); return gate.promise;
    } },
    tokenStore: store, createIdempotencyKey: () => token('i'),
  });
  const first = coordinator.refresh(); const second = coordinator.refresh();
  for (let i = 0; i < 20 && calls === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(calls, 1);
  gate.resolve(sessionResponse('GUEST', token('n')));
  const [a,b] = await Promise.all([first,second]);
  assert.equal(a.tokens.refreshToken, token('n')); assert.equal(b.tokens.refreshToken, token('n'));
});

test('pending refresh attempt survives coordinator recreation and reuses exact key', async () => {
  const storage = memoryStorage(); const firstStore = makeStore(token('o'), storage); await firstStore.initialize();
  const seen = [];
  const firstCoordinator = createSessionCoordinator({
    sessionApi: { refresh: async (rt,key) => { seen.push([rt,key]); throw new ApiError('Connection lost', { code: 'NETWORK_ERROR' }); } },
    tokenStore: firstStore, createIdempotencyKey: () => token('i'),
  });
  await assert.rejects(firstCoordinator.refresh(), /Connection lost/);
  const restartedStore = createTokenStore({ secureStorage: storage });
  const restartedCoordinator = createSessionCoordinator({
    sessionApi: { refresh: async (rt,key) => { seen.push([rt,key]); return sessionResponse('GUEST', token('n')); } },
    tokenStore: restartedStore, createIdempotencyKey: () => { throw new Error('must reuse persisted key'); },
  });
  await restartedCoordinator.refresh();
  assert.deepEqual(seen, [[token('o'),token('i')],[token('o'),token('i')]]);
  assert.deepEqual(JSON.parse(storage.values.get('nexira.session.state.v1')), {
    refreshToken: token('n'), pendingRefreshAttempt: null, pendingGuestConversion: null,
  });
});

test('missing refresh token does not invent or persist a session', async () => {
  const store = makeStore(); let calls = 0;
  const coordinator = createSessionCoordinator({ sessionApi: { refresh: async () => { calls++; } }, tokenStore: store });
  assert.equal(await coordinator.restore(), null); assert.equal(calls, 0);
});

test('unauthorized refresh clears credentials and identity', async () => {
  const store = makeStore(token('o')); await store.initialize();
  const coordinator = createSessionCoordinator({
    sessionApi: { refresh: async () => { throw new ApiError('Expired', { status: 401 }); } },
    tokenStore: store, createIdempotencyKey: () => token('i'),
  });
  await assert.rejects(coordinator.refresh(), /Expired/);
  assert.equal(await store.getRefreshToken(), null); assert.equal(coordinator.getCurrentPrincipal(), null);
});

test('logout clears local credentials even when backend logout fails', async () => {
  const store = makeStore(token('o')); await store.initialize();
  const coordinator = createSessionCoordinator({ sessionApi: { logout: async () => { throw new Error('offline'); } }, tokenStore: store });
  await assert.rejects(coordinator.logout(), /offline/);
  assert.equal(store.getAccessToken(), null); assert.equal(await store.getRefreshToken(), null);
});


test('a refresh response arriving after logout cannot restore credentials', async () => {
  const store = makeStore(token('o')); await store.initialize();
  const gate = deferred(); let refreshStarted = false;
  const coordinator = createSessionCoordinator({
    sessionApi: {
      refresh: async () => { refreshStarted = true; return gate.promise; },
      logout: async () => ({ success: true }),
    },
    tokenStore: store, createIdempotencyKey: () => token('i'),
  });

  const refresh = coordinator.refresh();
  for (let i = 0; i < 20 && !refreshStarted; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(refreshStarted, true);

  await coordinator.logout();
  gate.resolve(sessionResponse('GUEST', token('n')));
  await assert.rejects(refresh, (error) => error.code === 'SESSION_SUPERSEDED');
  assert.equal(store.getAccessToken(), null);
  assert.equal(await store.getRefreshToken(), null);
  assert.equal(coordinator.getCurrentPrincipal(), null);
  assert.equal(coordinator.getCurrentSession(), null);
});

test('an authentication response started before logout cannot recreate the session', async () => {
  const store = makeStore(token('o')); await store.initialize();
  const gate = deferred();
  const coordinator = createSessionCoordinator({
    sessionApi: {
      login: async () => gate.promise,
      logout: async () => ({ success: true }),
    },
    tokenStore: store,
  });

  const login = coordinator.login({ email: 'player@example.test', password: 'password' });
  await coordinator.logout();
  gate.resolve(sessionResponse('USER', token('n')));
  await assert.rejects(login, (error) => error.code === 'SESSION_SUPERSEDED');
  assert.equal(store.getAccessToken(), null);
  assert.equal(await store.getRefreshToken(), null);
  assert.equal(coordinator.getCurrentPrincipal(), null);
});


test('coordinator forwards cancellation options to session API calls', async () => {
  const store = makeStore();
  const signal = new AbortController().signal;
  const seen = [];
  const coordinator = createSessionCoordinator({
    sessionApi: {
      startGuest: async (options) => { seen.push(['startGuest', options]); return sessionResponse(); },
      getMyProfile: async (options) => { seen.push(['getMyProfile', options]); return { profile: {} }; },
    },
    tokenStore: store,
  });

  await coordinator.startGuest({ signal });
  await coordinator.getMyProfile({ signal });
  assert.equal(seen[0][1].signal, signal);
  assert.equal(seen[1][1].signal, signal);
});


test('a newer identity transition supersedes an earlier pending login response', async () => {
  const store = makeStore();
  const gate = deferred();
  let loginStarted = false;
  const coordinator = createSessionCoordinator({
    sessionApi: { login: async () => { loginStarted = true; return gate.promise; } },
    tokenStore: store,
  });

  const login = coordinator.login({ email: 'player@example.test', password: 'password' });
  for (let i = 0; i < 20 && !loginStarted; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(loginStarted, true);
  coordinator.beginSessionTransition();
  gate.resolve(sessionResponse('USER'));
  await assert.rejects(login, (error) => error.code === 'SESSION_SUPERSEDED');
  assert.equal(store.getAccessToken(), null);
  assert.equal(await store.getRefreshToken(), null);
  assert.equal(coordinator.getCurrentPrincipal(), null);
});


test('a stale unauthorized refresh cannot clear credentials from a newer login', async () => {
  const store = makeStore(token('o'));
  await store.initialize();
  const gate = deferred();
  let refreshStarted = false;
  const coordinator = createSessionCoordinator({
    sessionApi: {
      refresh: async () => { refreshStarted = true; return gate.promise; },
      login: async () => sessionResponse('USER', token('n')),
    },
    tokenStore: store,
    createIdempotencyKey: () => token('i'),
  });

  const refresh = coordinator.refresh();
  for (let i = 0; i < 20 && !refreshStarted; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(refreshStarted, true);

  coordinator.beginSessionTransition();
  await coordinator.login({ email: 'player@example.test', password: 'password' });
  assert.equal(store.getAccessToken(), 'access-token');

  gate.reject(new ApiError('Old refresh token was revoked', { status: 401 }));
  await assert.rejects(refresh, /Old refresh token was revoked/);
  assert.equal(store.getAccessToken(), 'access-token');
  assert.equal(await store.getRefreshToken(), token('n'));
  assert.equal(coordinator.getCurrentPrincipal().principalType, 'USER');
});


test('guest conversion persists proof before sending and recovers after process restart', async () => {
  const storage = memoryStorage();
  const firstStore = makeStore(token('r'), storage);
  await firstStore.initialize();
  const calls = [];
  const first = createSessionCoordinator({
    tokenStore: firstStore, createIdempotencyKey: () => token('i'),
    sessionApi: {
      convertGuest: async (credentials, key) => {
        calls.push(['convert', credentials.refreshToken, key]);
        assert.deepEqual(JSON.parse(storage.values.get('nexira.session.state.v1')).pendingGuestConversion,
          { refreshToken: token('r'), idempotencyKey: token('i') });
        throw new ApiError('response lost', { code: 'NETWORK_ERROR' });
      },
      retryGuestConversion: async (refresh, key) => {
        calls.push(['retry', refresh, key]);
        throw new ApiError('offline', { code: 'NETWORK_ERROR' });
      },
    },
  });
  await assert.rejects(first.convertGuest({ email: 'player@example.test', username: 'player', password: 'do-not-persist-this' }), /offline/);
  assert.equal(JSON.stringify(JSON.parse(storage.values.get('nexira.session.state.v1'))).includes('do-not-persist-this'), false);
  const restartedStore = createTokenStore({ secureStorage: storage });
  const converted = sessionResponse('USER', token('u'));
  const restarted = createSessionCoordinator({
    tokenStore: restartedStore, createIdempotencyKey: () => { throw new Error('must reuse stored key'); },
    sessionApi: { retryGuestConversion: async (refresh, key) => {
      calls.push(['retry-after-restart', refresh, key]); return converted;
    } },
  });
  await restarted.restore();
  assert.equal(restarted.getCurrentPrincipal().principalType, 'USER');
  assert.deepEqual(calls, [
    ['convert', token('r'), token('i')], ['retry', token('r'), token('i')],
    ['retry-after-restart', token('r'), token('i')],
  ]);
  assert.deepEqual(JSON.parse(storage.values.get('nexira.session.state.v1')), {
    refreshToken: token('u'), pendingRefreshAttempt: null, pendingGuestConversion: null,
  });
});

test('CONVERSION_NOT_COMMITTED clears pending proof and preserves guest refresh credentials', async () => {
  const storage = memoryStorage();
  const store = makeStore(token('r'), storage);
  await store.initialize();
  const coordinator = createSessionCoordinator({
    tokenStore: store, createIdempotencyKey: () => token('i'),
    sessionApi: {
      convertGuest: async () => { throw new ApiError('connection lost', { code: 'NETWORK_ERROR' }); },
      retryGuestConversion: async () => { throw new ApiError('not committed', { status: 409, code: 'CONVERSION_NOT_COMMITTED' }); },
    },
  });
  await assert.rejects(coordinator.convertGuest({ email: 'player@example.test', username: 'player', password: 'secret' }), /connection lost/);
  assert.deepEqual(JSON.parse(storage.values.get('nexira.session.state.v1')), {
    refreshToken: token('r'), pendingRefreshAttempt: null, pendingGuestConversion: null,
  });
  assert.equal(store.getAccessToken(), 'access-token');
});


test('ambiguous HTTP 5xx triggers recovery with the exact persisted proof', async () => {
  const storage = memoryStorage();
  const store = makeStore(token('r'), storage);
  await store.initialize();
  const converted = sessionResponse('USER', token('u'));
  let retries = 0;
  const coordinator = createSessionCoordinator({
    tokenStore: store, createIdempotencyKey: () => token('i'),
    sessionApi: {
      convertGuest: async () => { throw new ApiError('upstream failure', { status: 503, code: 'HTTP_ERROR' }); },
      retryGuestConversion: async (refresh, key) => {
        retries++;
        assert.equal(refresh, token('r'));
        assert.equal(key, token('i'));
        return converted;
      },
    },
  });
  await coordinator.convertGuest({ email: 'player@example.test', username: 'player', password: 'long-password' });
  assert.equal(retries, 1);
  assert.equal(coordinator.getCurrentPrincipal().principalType, 'USER');
});

test('logout waits for pending conversion proof persistence before clearing secure storage', async () => {
  const storage = memoryStorage();
  const store = makeStore(token('r'), storage);
  await store.initialize();
  let releaseWrite;
  const gate = new Promise((resolve) => { releaseWrite = resolve; });
  const originalSet = storage.set;
  storage.set = async (key, value) => {
    if (key === 'nexira.session.state.v1' && JSON.parse(value).pendingGuestConversion) await gate;
    return originalSet(key, value);
  };
  const coordinator = createSessionCoordinator({
    tokenStore: store, createIdempotencyKey: () => token('i'),
    sessionApi: {
      convertGuest: async () => { throw new Error('conversion request must wait for secure persistence'); },
      logout: async () => ({ success: true }),
    },
  });
  const conversion = coordinator.convertGuest({ email: 'player@example.test', username: 'player', password: 'long-password' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const logout = coordinator.logout();
  releaseWrite();
  await assert.rejects(conversion, (error) => error.code === 'SESSION_SUPERSEDED');
  await logout;
  assert.equal(storage.values.has('nexira.session.state.v1'), false);
});
