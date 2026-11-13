function createIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure random number generation is unavailable.');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function createOnlineMatchmakingAdapter(api, { createKey = createIdempotencyKey } = {}) {
  if (!api || typeof api.enqueue !== 'function' || typeof api.getMine !== 'function' || typeof api.cancel !== 'function') {
    throw new TypeError('A complete NEXIRA matchmaking API is required.');
  }
  let view = null;
  let idempotencyKey = null;

  return {
    async start({ category, language = 'en' } = {}) {
      const recovered = await api.getMine();
      if (recovered?.status === 'WAITING' || recovered?.status === 'MATCHED') {
        view = recovered;
        return view;
      }
      if (!idempotencyKey) idempotencyKey = createKey();
      view = await api.enqueue({ category, language, idempotencyKey });
      return view;
    },
    async refresh() {
      view = await api.getMine();
      return view;
    },
    async cancel() {
      view = await api.cancel();
      return view;
    },
    getView: () => view,
    reset() { view = null; idempotencyKey = null; },
  };
}