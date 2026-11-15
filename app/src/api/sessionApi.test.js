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


test('auth API exposes independent registration, Google sign-in and email verification', async () => {
  const calls = [];
  const http = {
    post: async (...args) => { calls.push(args); return {}; },
    get: async () => ({}), patch: async () => ({}), delete: async () => ({}),
  };
  const api = createSessionApi(http);
  const credentials = { email: 'player@example.com', username: 'player_01', displayName: 'Player', password: 'a-long-secure-password' };
  await api.register(credentials);
  await api.signInWithGoogle('google-id-token');
  await api.verifyEmail('v'.repeat(43));
  assert.deepEqual(calls, [
    ['/auth/register', credentials, { authenticated: false }],
    ['/auth/google', { idToken: 'google-id-token' }, { authenticated: false }],
    ['/auth/email/verify', { token: 'v'.repeat(43) }, { authenticated: false }],
  ]);
});
