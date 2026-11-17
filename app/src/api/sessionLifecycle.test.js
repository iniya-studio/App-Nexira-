import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionLifecycle } from './sessionLifecycle.js';

function makeServices({ restored = null, restoreError = null, guest = null, guestError = null, login = null, register = null, convertGuest = null, google = null } = {}) {
  const calls = [];
  let current = restored ?? guest ?? null;
  return {
    calls,
    coordinator: {
      async restore() { calls.push('restore'); if (restoreError) throw restoreError; return restored; },
      async startGuest() { calls.push('startGuest'); if (guestError) throw guestError; current = guest; return guest; },
      async login(credentials) { calls.push(['login', credentials]); current = login; return login; },
      async register(credentials) { calls.push(['register', credentials]); current = register; return register; },
      async convertGuest(credentials) { calls.push(['convertGuest', credentials]); current = convertGuest; return convertGuest; },
      async createGoogleChallenge() { calls.push('createGoogleChallenge'); return { nonce: 'n'.repeat(43), expiresAt: '2030-01-01T00:05:00.000Z' }; },
      async signInWithGoogle(token) { calls.push(['google', token]); current = google; return google; },
      async getMyProfile() { calls.push('getMyProfile'); return { principalType: current?.principal?.principalType, profile: { displayName: 'Player One' }, statistics: { matchesPlayed: 3, wins: 2, losses: 1, draws: 0 } }; },
      async updateMyProfile(changes) { calls.push(['updateMyProfile', changes]); return { principalType: current?.principal?.principalType, profile: { displayName: changes.displayName }, statistics: { matchesPlayed: 3, wins: 2, losses: 1, draws: 0 } }; },
      async getMyAccount() { calls.push('getMyAccount'); return { user: { id: 'user-1', email: 'player@example.com' }, authentication: { passwordEnabled: true, providers: [] }, emailVerification: { required: true, verified: false } }; },
      async listSessions() { calls.push('listSessions'); return { sessions: [{ sessionId: 'session-2', isCurrent: true, status: 'ACTIVE' }] }; },
      async revokeSession(id) { calls.push(['revokeSession', id]); return { success: true, revoked: true }; },
      async logoutAll() { calls.push('logoutAll'); return { success: true, revokedSessions: 2 }; },
      async clearLocalSession() { calls.push('clearLocalSession'); current = null; },
      async resendVerification() { calls.push('resendVerification'); return { accepted: true, delivery: 'SENT' }; },
      async verifyEmail(token) { calls.push(['verifyEmail', token]); return { verified: true }; },
      getCurrentPrincipal() { return current?.principal ?? null; },
      getCurrentSession() { return current?.session ?? null; },
      async logout() { calls.push('logout'); current = null; },
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

test('login promotes lifecycle to authenticated', async () => {
  const services = makeServices({ guest: guestResponse, login: userResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  const state = await lifecycle.login({ email: 'player@example.com', password: 'correct-password' });
  assert.equal(state.status, 'authenticated');
  assert.equal(state.principal.principalId, 'user-1');
});

test('guest conversion promotes account while preserving guest on failure', async () => {
  const services = makeServices({ guest: guestResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  await assert.rejects(lifecycle.convertGuest({ email: 'bad@example.com' }), /valid NEXIRA account session/);
  assert.equal(lifecycle.getState().status, 'guest');
  assert.equal(lifecycle.getState().principal.principalId, 'guest-1');
});

test('registered users cannot use the guest conversion operation', async () => {
  const services = makeServices({ restored: userResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  await assert.rejects(lifecycle.convertGuest({}), /Only an active guest account/);
});


test('email verification resend is exposed through the lifecycle', async () => {
  const services = makeServices({ guest: guestResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  const result = await lifecycle.resendVerification();
  assert.equal(result.emailVerification.delivery, 'SENT');
  assert.deepEqual(services.calls, ['restore', 'startGuest', 'resendVerification']);
});

test('email login exposes account details and derives verification state', async () => {
  const loginResponse = {
    ...userResponse,
    user: { id: 'user-1', email: 'player@example.com', displayName: 'Player One', emailVerifiedAt: null },
  };
  const services = makeServices({ guest: guestResponse, login: loginResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  const state = await lifecycle.login({ email: 'player@example.com', password: 'correct-password' });
  assert.equal(state.status, 'authenticated');
  assert.equal(state.account.email, 'player@example.com');
  assert.deepEqual(state.emailVerification, { required: true, verified: false, delivery: null });
});


test('registered profile loads authoritative profile, account and sessions', async () => {
  const services = makeServices({ restored: userResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  const state = await lifecycle.loadAccountData();
  assert.equal(state.profile.profile.displayName, 'Player One');
  assert.equal(state.profile.statistics.matchesPlayed, 3);
  assert.equal(state.account.email, 'player@example.com');
  assert.equal(state.sessions[0].isCurrent, true);
  assert.deepEqual(services.calls.slice(-3), ['getMyProfile', 'getMyAccount', 'listSessions']);
});

test('guest profile loads without requesting registered account or sessions', async () => {
  const services = makeServices({ guest: guestResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  const state = await lifecycle.loadAccountData();
  assert.equal(state.profile.principalType, 'GUEST');
  assert.equal(services.calls.includes('getMyAccount'), false);
  assert.equal(services.calls.includes('listSessions'), false);
});

test('profile updates use the server response as canonical data', async () => {
  const services = makeServices({ guest: guestResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  const state = await lifecycle.updateProfile({ displayName: 'Player Two' });
  assert.equal(state.profile.profile.displayName, 'Player Two');
});

test('revoking another session refreshes the server session inventory', async () => {
  const services = makeServices({ restored: userResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  await lifecycle.loadAccountData();
  const result = await lifecycle.revokeSession('session-old');
  assert.equal(result.revoked, true);
  assert.ok(services.calls.some((call) => Array.isArray(call) && call[0] === 'revokeSession'));
  assert.equal(services.calls.at(-3), 'getMyProfile');
});

test('logout-all revokes server sessions and clears the local authenticated identity', async () => {
  const services = makeServices({ restored: userResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  const result = await lifecycle.logoutAll();
  assert.equal(result.revokedSessions, 2);
  assert.equal(lifecycle.getState().status, 'signed-out');
  assert.ok(services.calls.includes('clearLocalSession'));
});


test('independent registration creates a registered session', async () => {
  const registered = { ...userResponse, user: { id: 'user-1', email: 'new@example.com' }, emailVerification: { required: true, verified: false, delivery: 'NOT_CONFIGURED' } };
  const services = makeServices({ guest: guestResponse, register: registered });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  const state = await lifecycle.register({ email: 'new@example.com', username: 'new_player', displayName: 'New Player', password: 'a-long-secure-password' });
  assert.equal(state.status, 'authenticated');
  assert.equal(state.account.email, 'new@example.com');
  assert.equal(state.emailVerification.delivery, 'NOT_CONFIGURED');
});

test('email verification accepts a valid one-time token and updates lifecycle state', async () => {
  const services = makeServices({ restored: userResponse });
  services.coordinator.getMyAccount = async () => ({
    user: { id: 'user-1', email: 'player@example.com' },
    authentication: { passwordEnabled: true, providers: [] },
    emailVerification: { required: false, verified: true },
  });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  const result = await lifecycle.verifyEmail('a'.repeat(43));
  assert.equal(result.verified, true);
  assert.equal(lifecycle.getState().emailVerification.verified, true);
  assert.ok(services.calls.some((call) => Array.isArray(call) && call[0] === 'verifyEmail'));
});

test('email verification rejects malformed tokens before calling the API', async () => {
  const services = makeServices({ restored: userResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  await assert.rejects(lifecycle.verifyEmail('short'), /valid email verification token/);
  assert.equal(services.calls.some((call) => Array.isArray(call) && call[0] === 'verifyEmail'), false);
});


test('password reset request uses the public generic-response endpoint', async () => {
  const services = makeServices({ restored: userResponse });
  services.coordinator.requestPasswordReset = async (email) => {
    services.calls.push(['requestPasswordReset', email]);
    return { accepted: true };
  };
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  const result = await lifecycle.requestPasswordReset('player@example.com');
  assert.deepEqual(result, { accepted: true });
  assert.deepEqual(services.calls.at(-1), ['requestPasswordReset', 'player@example.com']);
});

test('successful password reset clears the local session and returns to signed-out state', async () => {
  const services = makeServices({ restored: userResponse });
  services.coordinator.resetPassword = async (token, newPassword) => {
    services.calls.push(['resetPassword', token, newPassword]);
    return { success: true, sessionsRevoked: 2 };
  };
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  const result = await lifecycle.resetPassword('r'.repeat(43), 'a-new-long-password');
  assert.equal(result.sessionsRevoked, 2);
  assert.equal(lifecycle.getState().status, 'signed-out');
  assert.ok(services.calls.includes('clearLocalSession'));
});

test('password change and explicit Google linking require a registered account and refresh account data', async () => {
  const services = makeServices({ restored: userResponse });
  services.coordinator.changePassword = async () => ({ success: true, sessionsRevoked: 1 });
  services.coordinator.linkGoogleIdentity = async () => ({ linked: true, alreadyLinked: false, provider: 'GOOGLE' });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  const passwordResult = await lifecycle.changePassword('current-password', 'a-new-long-password');
  assert.equal(passwordResult.success, true);
  const linkResult = await lifecycle.linkGoogleIdentity('google-id-token');
  assert.equal(linkResult.linked, true);
  assert.ok(services.calls.filter((call) => call === 'getMyAccount').length >= 2);
  assert.ok(services.calls.filter((call) => call === 'listSessions').length >= 2);
});


test('Google authentication starts with a backend-issued one-time challenge', async () => {
  const services = makeServices({ guest: guestResponse });
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();
  const challenge = await lifecycle.createGoogleChallenge();
  assert.equal(challenge.nonce, 'n'.repeat(43));
  assert.equal(services.calls.at(-1), 'createGoogleChallenge');
});


test('an invalidated refresh token moves the lifecycle from active identity to signed-out', async () => {
  const services = makeServices({ guest: guestResponse });
  let notifyInvalidated;
  const lifecycle = createSessionLifecycle({
    platform: () => 'android',
    createServices: (options) => {
      notifyInvalidated = options.onSessionInvalidated;
      return services;
    },
  });

  await lifecycle.initialize();
  assert.equal(lifecycle.getState().status, 'guest');
  notifyInvalidated(Object.assign(new Error('Refresh revoked'), { status: 401 }));

  const state = lifecycle.getState();
  assert.equal(state.status, 'signed-out');
  assert.equal(state.principal, null);
  assert.equal(state.session, null);
  assert.match(state.error, /session has expired/i);
});


function deferredLifecycleValue() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('a login response arriving after logout cannot restore the lifecycle identity', async () => {
  const services = makeServices({ guest: guestResponse });
  const loginGate = deferredLifecycleValue();
  services.coordinator.login = async () => loginGate.promise;
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();

  const login = lifecycle.login({ email: 'player@example.com', password: 'correct-password' });
  await lifecycle.logout();
  loginGate.resolve(userResponse);
  await assert.rejects(login, /superseded by a newer session action/i);

  assert.equal(lifecycle.getState().status, 'signed-out');
  assert.equal(lifecycle.getState().principal, null);
  assert.equal(lifecycle.getState().session, null);
});

test('profile data arriving after logout is ignored instead of repopulating signed-out state', async () => {
  const services = makeServices({ restored: userResponse });
  const profileGate = deferredLifecycleValue();
  services.coordinator.getMyProfile = async () => profileGate.promise;
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });
  await lifecycle.initialize();

  const loading = lifecycle.loadAccountData();
  await lifecycle.logout();
  profileGate.resolve({
    principalType: 'USER',
    profile: { displayName: 'Stale Player Data' },
    statistics: { matchesPlayed: 99, wins: 99, losses: 0, draws: 0 },
  });
  const state = await loading;

  assert.equal(state.status, 'signed-out');
  assert.equal(state.principal, null);
  assert.equal(state.profile, null);
  assert.equal(state.account, null);
});

test('a restore response arriving after logout cannot restart an active session', async () => {
  const services = makeServices();
  const restoreGate = deferredLifecycleValue();
  services.coordinator.restore = async () => restoreGate.promise;
  const lifecycle = createSessionLifecycle({ platform: () => 'android', createServices: () => services });

  const initializing = lifecycle.initialize();
  await lifecycle.logout();
  restoreGate.resolve(userResponse);
  const state = await initializing;

  assert.equal(state.status, 'signed-out');
  assert.equal(state.principal, null);
  assert.equal(state.session, null);
  assert.equal(services.calls.includes('startGuest'), false);
});
