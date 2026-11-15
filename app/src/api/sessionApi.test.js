import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionApi } from './sessionApi.js';

test('session API exposes profile, account and session management endpoints', async () => {
  const calls = [];
  const http = {
    post: async (...args) => { calls.push(['post', ...args]); return {}; },
    get: async (...args) => { calls.push(['get', ...args]); return {}; },
    patch: async (...args) => { calls.push(['patch', ...args]); return {}; },
    delete: async (...args) => { calls.push(['delete', ...args]); return {}; },
  };
  const api = createSessionApi(http);
  await api.getMyProfile();
  await api.updateMyProfile({ displayName: 'Milad' });
  await api.getMyAccount();
  await api.listSessions();
  await api.revokeSession('session/id');
  await api.logoutAll();
  assert.deepEqual(calls, [
    ['get', '/profile/me'],
    ['patch', '/profile/me', { displayName: 'Milad' }],
    ['get', '/account/me'],
    ['get', '/sessions'],
    ['delete', '/sessions/session%2Fid'],
    ['post', '/sessions/logout-all'],
  ]);
});

test('session API still requires a configured HTTP client', () => {
  assert.throws(() => createSessionApi(null), /configured HTTP client/);
});
