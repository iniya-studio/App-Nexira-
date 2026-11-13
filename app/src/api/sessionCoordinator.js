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
  let currentPrincipal = null;
  let currentSession = null;

  async function acceptSession(response) {
    if (!response?.principal || !response?.session || !response?.tokens) {
      throw new TypeError('Backend returned an invalid session response.');
    }
    await tokenStore.saveTokenResponse(response);
    currentPrincipal = response.principal;
    currentSession = response.session;
    return response;
  }

  async function refreshSession() {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      const state = typeof tokenStore.getSessionState === 'function'
        ? await tokenStore.getSessionState()
        : { refreshToken: await tokenStore.getRefreshToken(), pendingRefreshAttempt: null };
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
        await tokenStore.savePendingRefreshAttempt(attempt);
      }

      try {
        const response = await sessionApi.refresh(attempt.refreshToken, attempt.idempotencyKey);
        return await acceptSession(response);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await tokenStore.clear();
          currentPrincipal = null;
          currentSession = null;
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
    async startGuest() { return acceptSession(await sessionApi.startGuest()); },
    async login(credentials) { return acceptSession(await sessionApi.login(credentials)); },
    async register(credentials) { return acceptSession(await sessionApi.register(credentials)); },
    async convertGuest(credentials) { return acceptSession(await sessionApi.convertGuest(credentials)); },
    async signInWithGoogle(idToken) { return acceptSession(await sessionApi.signInWithGoogle(idToken)); },
    async resendVerification() { return sessionApi.resendVerification(); },
    refresh: refreshSession,

    async restore() {
      if (tokenStore.getAccessToken()) {
        return { principal: currentPrincipal, session: currentSession };
      }
      return refreshSession();
    },

    async logout() {
      try {
        if (tokenStore.getAccessToken()) await sessionApi.logout();
      } finally {
        await tokenStore.clear();
        currentPrincipal = null;
        currentSession = null;
      }
    },

    getCurrentPrincipal: () => currentPrincipal,
    getCurrentSession: () => currentSession,
    isRefreshInFlight: () => refreshInFlight !== null,
  };
}
