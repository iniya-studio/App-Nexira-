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
  const listeners = new Set();

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

  function ensureServices() {
    if (platform() !== 'android') {
      throw new Error('Account sessions are currently supported on Android only.');
    }
    if (!services) services = createServices();
    return services;
  }

  async function performAccountAction(action, ...args) {
    const activeServices = ensureServices();
    try {
      const response = await activeServices.coordinator[action](...args);
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
      publish({ ...state, error: error instanceof Error ? error.message : 'Account operation failed.' });
      throw error;
    }
  }

  async function loadAccountData() {
    const activeServices = ensureServices();
    if (!['guest', 'authenticated'].includes(state.status)) return state;
    try {
      const profile = await activeServices.coordinator.getMyProfile();
      let account = null;
      let authentication = null;
      let sessions = [];
      let emailVerification = state.emailVerification;
      if (state.principal?.principalType === 'USER') {
        const [accountResult, sessionsResult] = await Promise.all([
          activeServices.coordinator.getMyAccount(),
          activeServices.coordinator.listSessions(),
        ]);
        account = accountResult?.user ?? null;
        authentication = accountResult?.authentication ?? null;
        sessions = Array.isArray(sessionsResult?.sessions) ? sessionsResult.sessions : [];
        emailVerification = accountResult?.emailVerification ?? emailVerification;
      }
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
      return publish({
        ...state,
        accountDataError: error instanceof Error ? error.message : 'Unable to load account data.',
      });
    }
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
      initialization = (async () => {
        try {
          if (platform() !== 'android') {
            return publish({ ...INITIAL_STATE, status: 'unsupported' });
          }
          publish({ ...INITIAL_STATE, status: 'initializing' });
          services = createServices();
          let response = await services.coordinator.restore();
          if (!response) response = await services.coordinator.startGuest();
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

    signInWithGoogle(idToken) { return performAccountAction('signInWithGoogle', idToken); },

    async loadAccountData() { return loadAccountData(); },

    async updateProfile(changes) {
      const activeServices = ensureServices();
      try {
        const profile = await activeServices.coordinator.updateMyProfile(changes);
        return publish({ ...state, profile, accountDataError: null });
      } catch (error) {
        publish({ ...state, accountDataError: error instanceof Error ? error.message : 'Unable to update profile.' });
        throw error;
      }
    },

    async revokeSession(sessionId) {
      if (sessionId === state.session?.sessionId) {
        throw new Error('Use the current-session sign-out action to revoke this device.');
      }
      const activeServices = ensureServices();
      const result = await activeServices.coordinator.revokeSession(sessionId);
      await loadAccountData();
      return result;
    },

    async logoutAll() {
      const activeServices = ensureServices();
      const result = await activeServices.coordinator.logoutAll();
      await activeServices.coordinator.clearLocalSession();
      publish({
        ...INITIAL_STATE,
        status: 'signed-out',
      });
      return result;
    },

    async verifyEmail(token) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
        throw new TypeError('A valid email verification token is required.');
      }
      const activeServices = ensureServices();
      try {
        const result = await activeServices.coordinator.verifyEmail(token);
        publish({ ...state, emailVerification: { required: false, verified: true }, accountDataError: null });
        if (['guest', 'authenticated'].includes(state.status)) await loadAccountData();
        return result;
      } catch (error) {
        publish({ ...state, accountDataError: error instanceof Error ? error.message : 'Email verification failed.' });
        throw error;
      }
    },

    async resendVerification() {
      const activeServices = ensureServices();
      const result = await activeServices.coordinator.resendVerification();
      return publish({ ...state, emailVerification: { ...state.emailVerification, ...result } });
    },

    async logout() {
      if (!services) throw new Error('NEXIRA session services are not initialized.');
      try {
        await services.coordinator.logout();
        return publish({ ...INITIAL_STATE, status: 'signed-out' });
      } catch (error) {
        classifyFailure(error);
        throw error;
      }
    },
  });
}

export const appSessionLifecycle = createSessionLifecycle();
