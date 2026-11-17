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
  await api.createGoogleChallenge();
  await api.signInWithGoogle({ idToken: 'google-id-token', nonce: 'n'.repeat(43) });
  await api.verifyEmail('v'.repeat(43));
  assert.deepEqual(calls, [
    ['/auth/register', credentials, { authenticated: false }],
    ['/auth/google/challenge', undefined, { authenticated: false }],
    ['/auth/google', { idToken: 'google-id-token', nonce: 'n'.repeat(43) }, { authenticated: false }],
    ['/auth/email/verify', { token: 'v'.repeat(43) }, { authenticated: false }],
  ]);
});


test('session API exposes password recovery, password change and explicit Google linking', async () => {
  const calls = [];
  const http = {
    post: async (...args) => { calls.push(args); return {}; },
    get: async () => ({}), patch: async () => ({}), delete: async () => ({}),
  };
  const api = createSessionApi(http);
  await api.requestPasswordReset('player@example.com');
  await api.resetPassword('r'.repeat(43), 'a-new-long-password');
  await api.changePassword('the-current-password', 'a-new-long-password');
  await api.linkGoogleIdentity({ idToken: 'google-id-token', nonce: 'n'.repeat(43) });
  assert.deepEqual(calls, [
    ['/auth/password/forgot', { email: 'player@example.com' }, { authenticated: false }],
    ['/auth/password/reset', { token: 'r'.repeat(43), newPassword: 'a-new-long-password' }, { authenticated: false }],
    ['/account/password/change', { currentPassword: 'the-current-password', newPassword: 'a-new-long-password' }],
    ['/account/identities/google/link', { idToken: 'google-id-token', nonce: 'n'.repeat(43) }],
  ]);
});


test('session API forwards AbortSignal without changing endpoint authentication policy', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const http = {
    post: async (...args) => { calls.push(['post', ...args]); return {}; },
    get: async (...args) => { calls.push(['get', ...args]); return {}; },
    patch: async (...args) => { calls.push(['patch', ...args]); return {}; },
    delete: async (...args) => { calls.push(['delete', ...args]); return {}; },
  };
  const api = createSessionApi(http);
  await api.login({ email: 'player@example.com', password: 'correct-password' }, { signal });
  await api.getMyProfile({ signal });
  await api.requestPasswordReset('player@example.com', { signal });

  assert.equal(calls[0][2].signal, signal);
  assert.equal(calls[0][2].authenticated, false);
  assert.equal(calls[1][2].signal, signal);
  assert.equal(calls[2][2].signal, signal);
  assert.equal(calls[2][2].authenticated, false);
});
