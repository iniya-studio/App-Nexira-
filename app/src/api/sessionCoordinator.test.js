import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from './httpClient.js';
import { createSessionCoordinator } from './sessionCoordinator.js';

const token = (character) => character.repeat(43);
function sessionResponse(principalType = 'GUEST', refresh = token('r')) {
  return {
    principal: { principalType, principalId: 'principal-1' },
    session: { sessionId: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
    tokens: {
      accessToken: 'access-token',
      accessTokenExpiresAt: '2030-01-01T00:05:00.000Z',
      refreshToken: refresh,
      refreshTokenExpiresAt: '2030-01-08T00:00:00.000Z',
    },
  };
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function makeStore(initialRefresh = null) {
  let access = null;
  let refresh = initialRefresh;
  return {
    getAccessToken: () => access,
    getRefreshToken: async () => refresh,
    saveTokenResponse: async (value) => { access = value.tokens.accessToken; refresh = value.tokens.refreshToken; },
    clear: async () => { access = null; refresh = null; },
  };
}

test('guest start stores session credentials and principal', async () => {
  const store = makeStore();
  const response = sessionResponse();
  const coordinator = createSessionCoordinator({
    sessionApi: { startGuest: async () => response },
    tokenStore: store,
  });
  await coordinator.startGuest();
  assert.equal(store.getAccessToken(), 'access-token');
  assert.equal(coordinator.getCurrentPrincipal().principalType, 'GUEST');
});

test('concurrent refresh calls share one backend rotation request', async () => {
  const store = makeStore(token('o'));
  const gate = deferred();
  let calls = 0;
  const coordinator = createSessionCoordinator({
    sessionApi: {
      refresh: async (refreshToken, idempotencyKey) => {
        calls += 1;
        assert.equal(refreshToken, token('o'));
        assert.match(idempotencyKey, /^[A-Za-z0-9_-]{43,128}$/);
        return gate.promise;
      },
    },
    tokenStore: store,
    createIdempotencyKey: () => token('i'),
  });

  const first = coordinator.refresh();
  const second = coordinator.refresh();
  assert.equal(calls, 0);
  await Promise.resolve();
  assert.equal(calls, 1);
  gate.resolve(sessionResponse('GUEST', token('n')));
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.tokens.refreshToken, token('n'));
  assert.equal(b.tokens.refreshToken, token('n'));
  assert.equal(await store.getRefreshToken(), token('n'));
});

test('missing secure refresh token does not invent or persist a session', async () => {
  const store = makeStore();
  let calls = 0;
  const coordinator = createSessionCoordinator({
    sessionApi: { refresh: async () => { calls += 1; } },
    tokenStore: store,
  });
  assert.equal(await coordinator.restore(), null);
  assert.equal(calls, 0);
});

test('unauthorized refresh clears credentials and in-memory identity', async () => {
  const store = makeStore(token('o'));
  const coordinator = createSessionCoordinator({
    sessionApi: { refresh: async () => { throw new ApiError('Expired', { status: 401 }); } },
    tokenStore: store,
    createIdempotencyKey: () => token('i'),
  });
  await assert.rejects(coordinator.refresh(), /Expired/);
  assert.equal(store.getAccessToken(), null);
  assert.equal(await store.getRefreshToken(), null);
  assert.equal(coordinator.getCurrentPrincipal(), null);
});

test('logout clears local credentials even when backend logout fails', async () => {
  const store = makeStore(token('o'));
  await store.saveTokenResponse(sessionResponse());
  const coordinator = createSessionCoordinator({
    sessionApi: { logout: async () => { throw new Error('offline'); } },
    tokenStore: store,
  });
  await assert.rejects(coordinator.logout(), /offline/);
  assert.equal(store.getAccessToken(), null);
  assert.equal(await store.getRefreshToken(), null);
});
