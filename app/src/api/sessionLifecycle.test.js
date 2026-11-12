import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionLifecycle } from './sessionLifecycle.js';

function makeServices({ restored = null, restoreError = null, guest = null, guestError = null } = {}) {
  const calls = [];
  const principal = restored?.principal ?? guest?.principal ?? null;
  const session = restored?.session ?? guest?.session ?? null;
  return {
    calls,
    coordinator: {
      async restore() { calls.push('restore'); if (restoreError) throw restoreError; return restored; },
      async startGuest() { calls.push('startGuest'); if (guestError) throw guestError; return guest; },
      getCurrentPrincipal() { return principal; },
      getCurrentSession() { return session; },
      async logout() { calls.push('logout'); },
    },
  };
}

const guestResponse = {
  principal: { principalType: 'GUEST', principalId: 'guest-1' },
  session: { sessionId: 'session-1' },
};
const userResponse = {
  principal: { principalType: 'USER', principalId: 'user-1' },
  session: { sessionId: 'session-2' },
};

test('Android startup restores an existing authenticated session without creating a guest', async () => {
  const services = makeServices({ restored: userResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  const state = await lifecycle.initialize();
  assert.equal(state.status, 'authenticated');
  assert.equal(state.principal.principalId, 'user-1');
  assert.deepEqual(services.calls, ['restore']);
});

test('Android startup creates one guest session only when no saved session exists', async () => {
  const services = makeServices({ guest: guestResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  const first = lifecycle.initialize();
  const second = lifecycle.initialize();
  assert.equal(first, second);
  const state = await first;
  assert.equal(state.status, 'guest');
  assert.deepEqual(services.calls, ['restore', 'startGuest']);
});

test('network failure during restore does not create a second guest identity', async () => {
  const services = makeServices({ restoreError: Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' }) });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  const state = await lifecycle.initialize();
  assert.equal(state.status, 'offline');
  assert.deepEqual(services.calls, ['restore']);
});

test('guest creation failure is surfaced as offline without breaking app startup', async () => {
  const services = makeServices({ guestError: Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' }) });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  const state = await lifecycle.initialize();
  assert.equal(state.status, 'offline');
  assert.deepEqual(services.calls, ['restore', 'startGuest']);
});

test('unsupported platforms do not construct native session services', async () => {
  let constructions = 0;
  const lifecycle = createSessionLifecycle({
    platform: () => 'ios',
    createServices: () => { constructions++; throw new Error('must not run'); },
  });
  const state = await lifecycle.initialize();
  assert.equal(state.status, 'unsupported');
  assert.equal(constructions, 0);
});

test('logout clears the active session through the coordinator', async () => {
  const services = makeServices({ restored: userResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  const state = await lifecycle.logout();
  assert.equal(state.status, 'signed-out');
  assert.deepEqual(services.calls, ['restore', 'logout']);
});

test('subscribers receive initial and subsequent lifecycle states', async () => {
  const services = makeServices({ guest: guestResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  const seen = [];
  const unsubscribe = lifecycle.subscribe((state) => seen.push(state.status));
  await lifecycle.initialize();
  unsubscribe();
  assert.deepEqual(seen, ['idle', 'initializing', 'guest']);
});


test('a transient startup failure can be retried without reloading the app', async () => {
  let attempts = 0;
  const services = makeServices({ guest: guestResponse });
  const lifecycle = createSessionLifecycle({
    platform: () => 'android',
    createServices: () => {
      attempts++;
      if (attempts === 1) throw Object.assign(new Error('API URL is not configured'), { code: 'CONFIGURATION_ERROR' });
      return services;
    },
  });
  const failed = await lifecycle.initialize();
  assert.equal(failed.status, 'error');
  const recovered = await lifecycle.retry();
  assert.equal(recovered.status, 'guest');
  assert.equal(attempts, 2);
  assert.deepEqual(services.calls, ['restore', 'startGuest']);
});

test('retry is a no-op while a valid session is already active', async () => {
  const services = makeServices({ guest: guestResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  const active = await lifecycle.initialize();
  const retried = await lifecycle.retry();
  assert.equal(retried, active);
  assert.deepEqual(services.calls, ['restore', 'startGuest']);
});
