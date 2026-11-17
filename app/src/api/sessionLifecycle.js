import { Capacitor } from '@capacitor/core';
import { createSessionServices } from './sessionServices.js';

const INITIAL_STATE = Object.freeze({
  status: 'idle',
  principal: null,
  session: null,
  error: null,
  emailVerification: null,
  account: null,
  profile: null,
  authentication: null,
  sessions: [],
  accountDataError: null,
});

export function createSessionLifecycle({
  platform = () => Capacitor.getPlatform(),
  createServices = createSessionServices,
} = {}) {
  let state = INITIAL_STATE;
  let services = null;
  let initialization = null;
  let lifecycleGeneration = 0;
  const listeners = new Set();
  const activeRequests = new Set();

  function abortActiveRequests(reason = 'The active account session is changing.', except = null) {
    for (const controller of activeRequests) {
      if (controller !== except) controller.abort(new Error(reason));
    }
  }

  function runRequest(operation) {
    const controller = new AbortController();
    activeRequests.add(controller);
    return Promise.resolve()
      .then(() => operation({ signal: controller.signal, controller }))
      .finally(() => activeRequests.delete(controller));
  }

  function publish(next) {
    state = Object.freeze({ ...next });
    for (const listener of listeners) listener(state);
    return state;
  }

  function classifyFailure(error) {
    const status = error?.code === 'NETWORK_ERROR' || error?.code === 'REQUEST_ABORTED'
      ? 'offline'
      : 'error';
    publish({
      ...state,
      status,
      principal: null,
      session: null,
      error: error instanceof Error ? error.message : 'Session initialization failed.',
    });
    return state;
  }

  function handleSessionInvalidated() {
    if (!['initializing', 'guest', 'authenticated'].includes(state.status)) return;
    abortActiveRequests('The session credentials were rejected.');
    lifecycleGeneration += 1;
    publish({
      ...INITIAL_STATE,
      status: 'signed-out',
      error: 'Your session has expired. Please sign in again.',
    });
  }

  function ensureServices() {
    if (platform() !== 'android') {
      throw new Error('Account sessions are currently supported on Android only.');
    }
    if (!services) services = createServices({ onSessionInvalidated: handleSessionInvalidated });
    return services;
  }

  async function performAccountAction(action, ...args) {
    const activeServices = ensureServices();
    abortActiveRequests('A new account identity is being established.');
    activeServices.coordinator.beginSessionTransition?.();
    const generation = ++lifecycleGeneration;
    return runRequest(async ({ signal }) => {
      try {
        const response = await activeServices.coordinator[action](...args, { signal });
        if (generation !== lifecycleGeneration) throw new Error('The account operation was superseded by a newer session action.');
        const principal = activeServices.coordinator.getCurrentPrincipal() ?? response?.principal ?? null;
        const session = activeServices.coordinator.getCurrentSession() ?? response?.session ?? null;
        if (!principal || !session) throw new Error('Backend did not provide a valid NEXIRA account session.');
        return publish({
          ...state,
          status: principal.principalType === 'GUEST' ? 'guest' : 'authenticated',
          principal,
          session,
          account: response?.user ?? null,
          emailVerification: response?.emailVerification ?? (response?.user
            ? { required: true, verified: Boolean(response.user.emailVerifiedAt), delivery: null }
            : null),
          profile: null,
          authentication: null,
          sessions: [],
          accountDataError: null,
          error: null,
        });
      } catch (error) {
        // A failed login or guest conversion must not discard a still-valid guest session.
        if (generation === lifecycleGeneration) {
          publish({ ...state, error: error instanceof Error ? error.message : 'Account operation failed.' });
        }
        throw error;
      }
    });
  }

  async function loadAccountData() {
    const generation = lifecycleGeneration;
    const activeServices = ensureServices();
    if (!['guest', 'authenticated'].includes(state.status)) return state;
    return runRequest(async ({ signal }) => {
      try {
        const profile = await activeServices.coordinator.getMyProfile({ signal });
        let account = null;
        let authentication = null;
        let sessions = [];
        let emailVerification = state.emailVerification;
        if (state.principal?.principalType === 'USER') {
          const [accountResult, sessionsResult] = await Promise.all([
            activeServices.coordinator.getMyAccount({ signal }),
            activeServices.coordinator.listSessions({ signal }),
          ]);
          account = accountResult?.user ?? null;
          authentication = accountResult?.authentication ?? null;
          sessions = Array.isArray(sessionsResult?.sessions) ? sessionsResult.sessions : [];
          emailVerification = accountResult?.emailVerification ?? emailVerification;
        }
        if (generation !== lifecycleGeneration || !['guest', 'authenticated'].includes(state.status)) return state;
        return publish({
          ...state,
          profile,
          account,
          authentication,
          sessions,
          emailVerification,
          accountDataError: null,
        });
      } catch (error) {
        if (generation !== lifecycleGeneration || !['guest', 'authenticated'].includes(state.status)) return state;
        return publish({
          ...state,
          accountDataError: error instanceof Error ? error.message : 'Unable to load account data.',
        });
      }
    });
  }

  return Object.freeze({
    getState: () => state,

    getHttpClient() {
      return ensureServices().http;
    },

    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('A session state listener is required.');
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },

    initialize() {
      if (initialization) return initialization;
      const generation = lifecycleGeneration;
      initialization = (async () => {
        try {
          if (platform() !== 'android') {
            return publish({ ...INITIAL_STATE, status: 'unsupported' });
          }
          publish({ ...INITIAL_STATE, status: 'initializing' });
          services = createServices({ onSessionInvalidated: handleSessionInvalidated });
          const response = await runRequest(async ({ signal }) => {
            let restored = await services.coordinator.restore({ signal });
            if (generation !== lifecycleGeneration) return null;
            if (!restored) restored = await services.coordinator.startGuest({ signal });
            return restored;
          });
          if (generation !== lifecycleGeneration) return state;
          const principal = services.coordinator.getCurrentPrincipal() ?? response?.principal ?? null;
          const session = services.coordinator.getCurrentSession() ?? response?.session ?? null;
          if (!principal || !session) throw new Error('Backend did not provide a restorable NEXIRA identity.');
          return publish({
            ...INITIAL_STATE,
            status: principal.principalType === 'GUEST' ? 'guest' : 'authenticated',
            principal,
            session,
            account: response?.user ?? null,
            emailVerification: response?.emailVerification ?? (response?.user
              ? { required: true, verified: Boolean(response.user.emailVerifiedAt), delivery: null }
              : null),
          });
        } catch (error) {
          if (generation !== lifecycleGeneration) return state;
          if (state.status === 'signed-out' && error?.status === 401) return state;
          return classifyFailure(error);
        }
      })();
      return initialization;
    },

    retry() {
      if (!['offline', 'error'].includes(state.status)) return initialization ?? Promise.resolve(state);
      initialization = null;
      services = null;
      return this.initialize();
    },

    login(credentials) { return performAccountAction('login', credentials); },
    register(credentials) { return performAccountAction('register', credentials); },

    convertGuest(credentials) {
      if (state.principal?.principalType !== 'GUEST') {
        return Promise.reject(new Error('Only an active guest account can be converted.'));
      }
      return performAccountAction('convertGuest', credentials);
    },

    async createGoogleChallenge() {
      const activeServices = ensureServices();
      return runRequest(({ signal }) => activeServices.coordinator.createGoogleChallenge({ signal }));
    },
    signInWithGoogle(idToken) { return performAccountAction('signInWithGoogle', idToken); },

    async requestPasswordReset(email) {
      const activeServices = ensureServices();
      return runRequest(({ signal }) => activeServices.coordinator.requestPasswordReset(email, { signal }));
    },

    async resetPassword(token, newPassword) {
      const generation = lifecycleGeneration;
      const activeServices = ensureServices();
      return runRequest(async ({ signal, controller }) => {
        const result = await activeServices.coordinator.resetPassword(token, newPassword, { signal });
        if (generation !== lifecycleGeneration) return result;
        abortActiveRequests('The password reset invalidated the previous session.', controller);
        lifecycleGeneration += 1;
        await activeServices.coordinator.clearLocalSession();
        if (generation + 1 === lifecycleGeneration) publish({ ...INITIAL_STATE, status: 'signed-out' });
        return result;
      });
    },

    async changePassword(currentPassword, newPassword) {
      if (state.status !== 'authenticated') throw new Error('A registered account session is required.');
      const activeServices = ensureServices();
      const result = await runRequest(({ signal }) => activeServices.coordinator.changePassword(currentPassword, newPassword, { signal }));
      await loadAccountData();
      return result;
    },

    async linkGoogleIdentity(idToken) {
      if (state.status !== 'authenticated' || state.principal?.principalType !== 'USER') {
        throw new Error('Sign in to a registered account before linking Google.');
      }
      const activeServices = ensureServices();
      const result = await runRequest(({ signal }) => activeServices.coordinator.linkGoogleIdentity(idToken, { signal }));
      await loadAccountData();
      return result;
    },

    async loadAccountData() { return loadAccountData(); },

    async updateProfile(changes) {
      const generation = lifecycleGeneration;
      const activeServices = ensureServices();
      return runRequest(async ({ signal }) => {
        try {
          const profile = await activeServices.coordinator.updateMyProfile(changes, { signal });
          if (generation !== lifecycleGeneration || !['guest', 'authenticated'].includes(state.status)) return state;
          return publish({ ...state, profile, accountDataError: null });
        } catch (error) {
          if (generation === lifecycleGeneration && ['guest', 'authenticated'].includes(state.status)) {
            publish({ ...state, accountDataError: error instanceof Error ? error.message : 'Unable to update profile.' });
          }
          throw error;
        }
      });
    },

    async revokeSession(sessionId) {
      if (sessionId === state.session?.sessionId) {
        throw new Error('Use the current-session sign-out action to revoke this device.');
      }
      const activeServices = ensureServices();
      const result = await runRequest(({ signal }) => activeServices.coordinator.revokeSession(sessionId, { signal }));
      await loadAccountData();
      return result;
    },

    async logoutAll() {
      const activeServices = ensureServices();
      abortActiveRequests('All sessions are being revoked.');
      const generation = ++lifecycleGeneration;
      publish({ ...INITIAL_STATE, status: 'signed-out' });
      try {
        const result = await activeServices.coordinator.logoutAll();
        await activeServices.coordinator.clearLocalSession();
        if (generation === lifecycleGeneration) publish({ ...INITIAL_STATE, status: 'signed-out' });
        return result;
      } catch (error) {
        if (generation === lifecycleGeneration) publish({ ...INITIAL_STATE, status: 'signed-out', error: error instanceof Error ? error.message : 'Unable to revoke sessions.' });
        throw error;
      }
    },

    async verifyEmail(token) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
        throw new TypeError('A valid email verification token is required.');
      }
      const generation = lifecycleGeneration;
      const activeServices = ensureServices();
      try {
        const result = await runRequest(({ signal }) => activeServices.coordinator.verifyEmail(token, { signal }));
        if (generation !== lifecycleGeneration || !['guest', 'authenticated'].includes(state.status)) return result;
        publish({ ...state, emailVerification: { required: false, verified: true }, accountDataError: null });
        if (['guest', 'authenticated'].includes(state.status)) await loadAccountData();
        return result;
      } catch (error) {
        if (generation === lifecycleGeneration && ['guest', 'authenticated'].includes(state.status)) {
          publish({ ...state, accountDataError: error instanceof Error ? error.message : 'Email verification failed.' });
        }
        throw error;
      }
    },

    async resendVerification() {
      const generation = lifecycleGeneration;
      const activeServices = ensureServices();
      const result = await runRequest(({ signal }) => activeServices.coordinator.resendVerification({ signal }));
      if (generation !== lifecycleGeneration || !['guest', 'authenticated'].includes(state.status)) return result;
      return publish({ ...state, emailVerification: { ...state.emailVerification, ...result } });
    },

    async logout() {
      if (!services) throw new Error('NEXIRA session services are not initialized.');
      abortActiveRequests('The current account is signing out.');
      const generation = ++lifecycleGeneration;
      publish({ ...INITIAL_STATE, status: 'signed-out' });
      try {
        await services.coordinator.logout();
        if (generation === lifecycleGeneration) return publish({ ...INITIAL_STATE, status: 'signed-out' });
        return state;
      } catch (error) {
        if (generation === lifecycleGeneration) {
          publish({ ...INITIAL_STATE, status: 'signed-out', error: error instanceof Error ? error.message : 'Unable to complete sign out.' });
        }
        throw error;
      }
    },
  });
}

export const appSessionLifecycle = createSessionLifecycle();
