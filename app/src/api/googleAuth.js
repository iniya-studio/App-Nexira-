import { Capacitor, registerPlugin } from '@capacitor/core';

const NativeGoogleAuth = registerPlugin('NexiraGoogleAuth');
const environment = import.meta.env ?? {};

export function createGoogleAuthAdapter({
  platform = () => Capacitor.getPlatform(),
  clientId = environment.VITE_GOOGLE_WEB_CLIENT_ID ?? '',
  plugin = NativeGoogleAuth,
} = {}) {
  return Object.freeze({
    async getIdentity(nonce) {
      if (platform() !== 'android') {
        throw new Error('Native Google sign-in is currently available on Android only.');
      }
      const serverClientId = typeof clientId === 'string' ? clientId.trim() : '';
      if (!serverClientId || !serverClientId.endsWith('.apps.googleusercontent.com')) {
        throw new Error('Google sign-in is not configured yet. Please try another sign-in method.');
      }
      if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) {
        throw new Error('A valid one-time Google sign-in challenge is required.');
      }
      const result = await plugin.signIn({ serverClientId, nonce });
      if (typeof result?.idToken !== 'string' || result.idToken.length < 100) {
        throw new Error('Google did not return a valid identity token.');
      }
      return { idToken: result.idToken, nonce };
    },
    async getIdToken(nonce) { return (await this.getIdentity(nonce)).idToken; },
    async cancel() {
      if (typeof plugin.cancel === 'function') await plugin.cancel();
    },
  });
}

export const googleAuth = createGoogleAuthAdapter();
