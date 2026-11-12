import { Capacitor } from '@capacitor/core';
import { createSessionServices } from './sessionServices.js';

const INITIAL_STATE = Object.freeze({
  status: 'idle',
  principal: null,
  session: null,
  error: null,
  emailVerification: null,
  account: null,
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
    publish({ status, principal: null, session: null, error: error instanceof Error ? error.message : 'Session initialization failed.' });
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
        status: principal.principalType === 'GUEST' ? 'guest' : 'authenticated',
        principal,
        session,
        emailVerification: response?.emailVerification ?? (response?.user
          ? { required: true, verified: Boolean(response.user.emailVerifiedAt), delivery: null }
          : state.emailVerification),
        account: response?.user ?? response?.account ?? state.account,
        error: null,
      });
    } catch (error) {
      // A failed login or guest conversion must not discard a still-valid guest session.
      publish({ ...state, error: error instanceof Error ? error.message : 'Account operation failed.' });
      throw error;
    }
  }

  return Object.freeze({
    getState: () => state,

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
            return publish({ status: 'unsupported', principal: null, session: null, error: null });
          }

          publish({ status: 'initializing', principal: null, session: null, error: null });
          services = createServices();
          let response = await services.coordinator.restore();
          if (!response) response = await services.coordinator.startGuest();

          const principal = services.coordinator.getCurrentPrincipal() ?? response?.principal ?? null;
          const session = services.coordinator.getCurrentSession() ?? response?.session ?? null;
          if (!principal || !session) {
            throw new Error('Backend did not provide a restorable NEXIRA identity.');
          }
          return publish({
            status: principal.principalType === 'GUEST' ? 'guest' : 'authenticated',
            principal,
            session,
            error: null,
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

    login(credentials) {
      return performAccountAction('login', credentials);
    },

    register(credentials) {
      return performAccountAction('register', credentials);
    },

    convertGuest(credentials) {
      if (state.principal?.principalType !== 'GUEST') {
        return Promise.reject(new Error('Only an active guest account can be converted.'));
      }
      return performAccountAction('convertGuest', credentials);
    },

    signInWithGoogle(idToken) {
      return performAccountAction('signInWithGoogle', idToken);
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
        return publish({ status: 'signed-out', principal: null, session: null, emailVerification: null, account: null, error: null });
      } catch (error) {
        classifyFailure(error);
        throw error;
      }
    },
  });
}

// A module-level lifecycle keeps React StrictMode effect replays from creating
// duplicate guest sessions during one application process.
export const appSessionLifecycle = createSessionLifecycle();
