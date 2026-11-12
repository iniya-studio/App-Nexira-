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
  let pendingRefreshAttempt = null;
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
      const refreshToken = await tokenStore.getRefreshToken();
      if (!refreshToken) {
        pendingRefreshAttempt = null;
        await tokenStore.clear();
        currentPrincipal = null;
        currentSession = null;
        return null;
      }

      // A lost response may mean the server already rotated the token. Reuse
      // the exact token/key pair on retry so the backend's encrypted replay
      // response returns the same successor instead of treating it as reuse.
      if (!pendingRefreshAttempt || pendingRefreshAttempt.refreshToken !== refreshToken) {
        pendingRefreshAttempt = { refreshToken, idempotencyKey: createIdempotencyKey() };
      }
      try {
        const response = await sessionApi.refresh(
          pendingRefreshAttempt.refreshToken,
          pendingRefreshAttempt.idempotencyKey,
        );
        const accepted = await acceptSession(response);
        pendingRefreshAttempt = null;
        return accepted;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          pendingRefreshAttempt = null;
          await tokenStore.clear();
          currentPrincipal = null;
          currentSession = null;
        }
        throw error;
      }
    })().finally(() => {
      refreshInFlight = null;
    });

    return refreshInFlight;
  }

  return {
    async startGuest() {
      const response = await sessionApi.startGuest();
      return acceptSession(response);
    },

    async login(credentials) {
      const response = await sessionApi.login(credentials);
      return acceptSession(response);
    },

    async register(credentials) {
      const response = await sessionApi.register(credentials);
      return acceptSession(response);
    },

    async convertGuest(credentials) {
      const response = await sessionApi.convertGuest(credentials);
      return acceptSession(response);
    },

    async signInWithGoogle(idToken) {
      const response = await sessionApi.signInWithGoogle(idToken);
      return acceptSession(response);
    },

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
        pendingRefreshAttempt = null;
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
