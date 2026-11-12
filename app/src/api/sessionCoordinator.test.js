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
  await Promise.resolve(); await Promise.resolve();
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
    refreshToken: token('n'), pendingRefreshAttempt: null,
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
