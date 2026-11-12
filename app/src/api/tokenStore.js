const SESSION_STATE_KEY = 'nexira.session.state.v1';
const LEGACY_REFRESH_TOKEN_KEY = 'nexira.session.refresh.v1';

const isRefreshToken = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(value);

function isPendingAttempt(value, refreshToken) {
  return Boolean(
    value
    && typeof value === 'object'
    && value.refreshToken === refreshToken
    && isRefreshToken(value.refreshToken)
    && isRefreshToken(value.idempotencyKey),
  );
}

function isTokenResponse(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof value.tokens?.accessToken === 'string'
    && value.tokens.accessToken.length > 0
    && isRefreshToken(value.tokens?.refreshToken),
  );
}

/**
 * Access tokens are memory-only. Refresh token and retry metadata are stored
 * together as one encrypted native value so rotation state is crash-safe.
 * There is deliberately no browser/plaintext fallback.
 */
export function createTokenStore({ secureStorage = null } = {}) {
  if (secureStorage !== null && (
    typeof secureStorage.get !== 'function'
    || typeof secureStorage.set !== 'function'
    || typeof secureStorage.remove !== 'function'
  )) {
    throw new TypeError('Secure storage adapter must implement get, set, and remove.');
  }

  let accessToken = null;
  let accessTokenExpiresAt = null;

  async function readSessionState() {
    if (!secureStorage) return { refreshToken: null, pendingRefreshAttempt: null };
    const raw = await secureStorage.get(SESSION_STATE_KEY);
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            && isRefreshToken(parsed.refreshToken)) {
          const pending = parsed.pendingRefreshAttempt;
          if (pending !== null && pending !== undefined
              && !isPendingAttempt(pending, parsed.refreshToken)) {
            throw new Error('Pending refresh metadata is invalid; refusing to rotate the session.');
          }
          return {
            refreshToken: parsed.refreshToken,
            pendingRefreshAttempt: pending ?? null,
          };
        }
        if (parsed === null) return { refreshToken: null, pendingRefreshAttempt: null };
      } catch {
        // Invalid encrypted payload is rejected rather than treated as a session.
      }
      throw new Error('Secure session state is invalid; refusing to overwrite it.');
    }

    // One-time migration from the previous refresh-token-only secure key.
    const legacy = await secureStorage.get(LEGACY_REFRESH_TOKEN_KEY);
    if (isRefreshToken(legacy)) {
      await secureStorage.set(SESSION_STATE_KEY, JSON.stringify({
        refreshToken: legacy,
        pendingRefreshAttempt: null,
      }));
      await secureStorage.remove(LEGACY_REFRESH_TOKEN_KEY);
      return { refreshToken: legacy, pendingRefreshAttempt: null };
    }
    return { refreshToken: null, pendingRefreshAttempt: null };
  }

  async function writeSessionState(state) {
    if (!secureStorage) return false;
    const normalized = {
      refreshToken: isRefreshToken(state?.refreshToken) ? state.refreshToken : null,
      pendingRefreshAttempt: isPendingAttempt(state?.pendingRefreshAttempt, state?.refreshToken)
        ? state.pendingRefreshAttempt
        : null,
    };
    if (!normalized.refreshToken) normalized.pendingRefreshAttempt = null;
    await secureStorage.set(SESSION_STATE_KEY, JSON.stringify(normalized));
    return true;
  }

  return {
    getAccessToken() {
      if (!accessToken) return null;
      if (accessTokenExpiresAt && Date.parse(accessTokenExpiresAt) <= Date.now()) {
        accessToken = null;
        accessTokenExpiresAt = null;
        return null;
      }
      return accessToken;
    },

    async getSessionState() {
      return readSessionState();
    },

    async getRefreshToken() {
      return (await readSessionState()).refreshToken;
    },

    async savePendingRefreshAttempt(attempt) {
      const state = await readSessionState();
      if (!isPendingAttempt(attempt, state.refreshToken)) {
        throw new TypeError('Pending refresh attempt does not match the stored refresh token.');
      }
      await writeSessionState({ ...state, pendingRefreshAttempt: attempt });
    },

    async saveTokenResponse(response) {
      if (!isTokenResponse(response)) {
        throw new TypeError('Backend returned an invalid session token response.');
      }

      if (secureStorage) {
        await writeSessionState({
          refreshToken: response.tokens.refreshToken,
          pendingRefreshAttempt: null,
        });
      }

      accessToken = response.tokens.accessToken;
      accessTokenExpiresAt = response.tokens.accessTokenExpiresAt ?? null;
      return { persisted: Boolean(secureStorage) };
    },

    async clear() {
      accessToken = null;
      accessTokenExpiresAt = null;
      if (secureStorage) {
        await secureStorage.remove(SESSION_STATE_KEY);
        await secureStorage.remove(LEGACY_REFRESH_TOKEN_KEY);
      }
    },

    hasPersistentRefreshStorage() {
      return Boolean(secureStorage);
    },
  };
}
