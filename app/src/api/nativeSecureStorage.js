import { registerPlugin } from '@capacitor/core';

const NativeSecureStorage = registerPlugin('NexiraSecureStorage');

/**
 * Capacitor adapter for the native Android Keystore / AES-GCM implementation.
 * iOS must provide a Keychain implementation with this same contract before
 * persistent sessions are enabled on iOS.
 */
export const nativeSecureStorage = Object.freeze({
  async get(key) {
    const result = await NativeSecureStorage.get({ key });
    return typeof result?.value === 'string' ? result.value : null;
  },
  async set(key, value) {
    await NativeSecureStorage.set({ key, value });
  },
  async remove(key) {
    await NativeSecureStorage.remove({ key });
  },
});
