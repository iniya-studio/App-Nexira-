const REFRESH_TOKEN_KEY = 'nexira.session.refresh.v1';

function isTokenResponse(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof value.tokens?.accessToken === 'string'
    && value.tokens.accessToken.length > 0
    && typeof value.tokens?.refreshToken === 'string'
    && /^[A-Za-z0-9_-]{43,128}$/.test(value.tokens.refreshToken),
  );
}

/**
 * Access tokens are memory-only. Refresh tokens may be persisted only through
 * an explicitly supplied native secure-storage adapter. There is deliberately
 * no localStorage, sessionStorage, Preferences, or plaintext fallback.
 *
 * Adapter contract:
 *   get(key) -> string | null
 *   set(key, value) -> void
 *   remove(key) -> void
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

    async getRefreshToken() {
      if (!secureStorage) return null;
      const value = await secureStorage.get(REFRESH_TOKEN_KEY);
      return typeof value === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(value)
        ? value
        : null;
    },

    async saveTokenResponse(response) {
      if (!isTokenResponse(response)) {
        throw new TypeError('Backend returned an invalid session token response.');
      }

      // Persist the refresh token before exposing the new access token in memory.
      // If secure persistence fails, do not leave a partially updated session.
      if (secureStorage) {
        await secureStorage.set(REFRESH_TOKEN_KEY, response.tokens.refreshToken);
      }

      accessToken = response.tokens.accessToken;
      accessTokenExpiresAt = response.tokens.accessTokenExpiresAt ?? null;
      return { persisted: Boolean(secureStorage) };
    },

    async clear() {
      accessToken = null;
      accessTokenExpiresAt = null;
      if (secureStorage) await secureStorage.remove(REFRESH_TOKEN_KEY);
    },

    hasPersistentRefreshStorage() {
      return Boolean(secureStorage);
    },
  };
}
