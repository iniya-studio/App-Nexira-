import { Capacitor } from '@capacitor/core';
import { getApiV1BaseUrl } from './apiConfig.js';
import { createHttpClient } from './httpClient.js';
import { createSessionApi } from './sessionApi.js';
import { createSessionCoordinator } from './sessionCoordinator.js';
import { createTokenStore } from './tokenStore.js';
import { nativeSecureStorage } from './nativeSecureStorage.js';

/**
 * Compose the production session stack only on platforms with an implemented
 * native secure-storage adapter. Android is supported in V1; iOS must add a
 * Keychain implementation before persistent sessions can be enabled there.
 */
export function createSessionServices({
  platform = Capacitor.getPlatform(),
  baseUrl = getApiV1BaseUrl(),
  secureStorage = nativeSecureStorage,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (platform !== 'android') {
    throw new Error('Persistent NEXIRA sessions are currently supported on Android only.');
  }
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new Error('A configured NEXIRA API base URL is required for sessions.');
  }
  if (!secureStorage || typeof secureStorage.get !== 'function'
      || typeof secureStorage.set !== 'function'
      || typeof secureStorage.remove !== 'function') {
    throw new Error('Native secure storage is required; plaintext fallback is disabled.');
  }

  const tokenStore = createTokenStore({ secureStorage });
  const http = createHttpClient({
    baseUrl,
    getAccessToken: () => tokenStore.getAccessToken(),
    fetchImpl,
  });
  const sessionApi = createSessionApi(http);
  const coordinator = createSessionCoordinator({ sessionApi, tokenStore });

  return Object.freeze({ tokenStore, http, sessionApi, coordinator });
}
