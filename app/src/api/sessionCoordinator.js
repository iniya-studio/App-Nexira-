import { ApiError } from './httpClient.js';

function createSecureIdempotencyKey() {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure random number generation is unavailable.');
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function createSessionCoordinator({
  sessionApi,
  tokenStore,
  createIdempotencyKey = createSecureIdempotencyKey,
} = {}) {
  if (!sessionApi || !tokenStore) {
    throw new TypeError('Session API and token store are required.');
  }

  let refreshInFlight = null;
  let logoutInFlight = null;
  let clearInFlight = null;
  let sessionGeneration = 0;
  let currentPrincipal = null;
  let currentSession = null;
  const pendingSessionWrites = new Set();

  function supersededError() {
    return new ApiError('The session operation was superseded by a newer session action.', {
      code: 'SESSION_SUPERSEDED',
    });
  }

  async function clearCredentials() {
    if (clearInFlight) return clearInFlight;
    sessionGeneration += 1;
    clearInFlight = (async () => {
      await Promise.allSettled([...pendingSessionWrites]);
      await tokenStore.clear();
      currentPrincipal = null;
      currentSession = null;
    })().finally(() => {
      clearInFlight = null;
    });
    return clearInFlight;
  }

  async function acceptSession(response, expectedGeneration) {
    if (!response?.principal || !response?.session || !response?.tokens) {
      throw new TypeError('Backend returned an invalid session response.');
    }
    if (expectedGeneration !== sessionGeneration) throw supersededError();

    const write = tokenStore.saveTokenResponse(response);
    pendingSessionWrites.add(write);
    try {
      await write;
    } finally {
      pendingSessionWrites.delete(write);
    }
    if (expectedGeneration !== sessionGeneration) throw supersededError();

    currentPrincipal = response.principal;
    currentSession = response.session;
    return response;
  }

  async function createSession(action, args = [], options = {}) {
    if (logoutInFlight) await logoutInFlight.catch(() => {});
    if (clearInFlight) await clearInFlight;
    const generation = sessionGeneration;
    const response = await sessionApi[action](...args, options);
    return acceptSession(response, generation);
  }

  async function refreshSession() {
    if (logoutInFlight) await logoutInFlight.catch(() => {});
    if (clearInFlight) await clearInFlight;
    if (refreshInFlight) return refreshInFlight;

    const generation = sessionGeneration;
    refreshInFlight = (async () => {
      const state = typeof tokenStore.getSessionState === 'function'
        ? await tokenStore.getSessionState()
        : { refreshToken: await tokenStore.getRefreshToken(), pendingRefreshAttempt: null };
      if (generation !== sessionGeneration) throw supersededError();

      const refreshToken = state.refreshToken;
      if (!refreshToken) {
        await tokenStore.clear();
        currentPrincipal = null;
        currentSession = null;
        return null;
      }

      let attempt = state.pendingRefreshAttempt;
      if (!attempt || attempt.refreshToken !== refreshToken) {
        attempt = { refreshToken, idempotencyKey: createIdempotencyKey() };
        if (typeof tokenStore.savePendingRefreshAttempt !== 'function') {
          throw new Error('Crash-safe secure refresh-attempt storage is required.');
        }
        // Must commit before the request can rotate the server-side token.
        const pendingWrite = tokenStore.savePendingRefreshAttempt(attempt);
        pendingSessionWrites.add(pendingWrite);
        try {
          await pendingWrite;
        } finally {
          pendingSessionWrites.delete(pendingWrite);
        }
      }
      if (generation !== sessionGeneration) throw supersededError();

      try {
        const response = await sessionApi.refresh(attempt.refreshToken, attempt.idempotencyKey);
        return await acceptSession(response, generation);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await clearCredentials();
        }
        // On uncertain failures the encrypted attempt remains for exact replay
        // after either an in-process retry or an application restart.
        throw error;
      }
    })().finally(() => {
      refreshInFlight = null;
    });

    return refreshInFlight;
  }

  return {
    async startGuest(options) { return createSession('startGuest', [], options); },
    async login(credentials, options) { return createSession('login', [credentials], options); },
    async register(credentials, options) { return createSession('register', [credentials], options); },
    async convertGuest(credentials, options) { return createSession('convertGuest', [credentials], options); },
    async createGoogleChallenge(options) { return sessionApi.createGoogleChallenge(options); },
    async signInWithGoogle(idToken, options) { return createSession('signInWithGoogle', [idToken], options); },
    async requestPasswordReset(email, options) { return sessionApi.requestPasswordReset(email, options); },
    async resetPassword(token, newPassword, options) { return sessionApi.resetPassword(token, newPassword, options); },
    async changePassword(currentPassword, newPassword, options) { return sessionApi.changePassword(currentPassword, newPassword, options); },
    async linkGoogleIdentity(idToken, options) { return sessionApi.linkGoogleIdentity(idToken, options); },
    async resendVerification(options) { return sessionApi.resendVerification(options); },
    async verifyEmail(token, options) { return sessionApi.verifyEmail(token, options); },
    async getMyProfile(options) { return sessionApi.getMyProfile(options); },
    async updateMyProfile(changes, options) { return sessionApi.updateMyProfile(changes, options); },
    async getMyAccount(options) { return sessionApi.getMyAccount(options); },
    async listSessions(options) { return sessionApi.listSessions(options); },
    async logoutAll(options) { return sessionApi.logoutAll(options); },
    async revokeSession(sessionId, options) { return sessionApi.revokeSession(sessionId, options); },
    async clearLocalSession() {
      await clearCredentials();
    },
    refresh: refreshSession,

    async restore() {
      if (tokenStore.getAccessToken()) {
        return { principal: currentPrincipal, session: currentSession };
      }
      return refreshSession();
    },

    logout() {
      if (logoutInFlight) return logoutInFlight;
      sessionGeneration += 1;
      logoutInFlight = (async () => {
        try {
          if (tokenStore.getAccessToken()) await sessionApi.logout();
        } finally {
          await Promise.allSettled([...pendingSessionWrites]);
          await tokenStore.clear();
          currentPrincipal = null;
          currentSession = null;
        }
      })().finally(() => {
        logoutInFlight = null;
      });
      return logoutInFlight;
    },

    getCurrentPrincipal: () => currentPrincipal,
    getCurrentSession: () => currentSession,
    isRefreshInFlight: () => refreshInFlight !== null,
  };
}
