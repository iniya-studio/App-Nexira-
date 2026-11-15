import { Capacitor } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';

const NativeGoogleAuth = registerPlugin('NexiraGoogleAuth');
const environment = import.meta.env ?? {};

function createNonce(cryptoObject = globalThis.crypto) {
  if (!cryptoObject?.getRandomValues) {
    throw new Error('Secure random generation is unavailable on this device.');
  }
  const bytes = cryptoObject.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
}

export function createGoogleAuthAdapter({
  platform = () => Capacitor.getPlatform(),
  clientId = environment.VITE_GOOGLE_WEB_CLIENT_ID ?? '',
  plugin = NativeGoogleAuth,
  cryptoObject = globalThis.crypto,
} = {}) {
  return Object.freeze({
    async getIdToken() {
      if (platform() !== 'android') {
        throw new Error('Native Google sign-in is currently available on Android only.');
      }
      const serverClientId = typeof clientId === 'string' ? clientId.trim() : '';
      if (!serverClientId || !serverClientId.endsWith('.apps.googleusercontent.com')) {
        throw new Error('Google sign-in is not configured yet. Please try another sign-in method.');
      }
      const result = await plugin.signIn({
        serverClientId,
        nonce: createNonce(cryptoObject),
      });
      if (typeof result?.idToken !== 'string' || result.idToken.length < 100) {
        throw new Error('Google did not return a valid identity token.');
      }
      return result.idToken;
    },
    async cancel() {
      if (typeof plugin.cancel === 'function') await plugin.cancel();
    },
  });
}

export const googleAuth = createGoogleAuthAdapter();
