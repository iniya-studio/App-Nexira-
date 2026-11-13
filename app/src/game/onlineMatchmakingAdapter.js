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
      const activeMatchedGame = recovered?.status === 'MATCHED' &&
        !['COMPLETED', 'CANCELLED'].includes(recovered.match?.status);
      if (
        ['CANCELLED', 'EXPIRED'].includes(recovered?.status) ||
        (recovered?.status === 'NOT_QUEUED' && recovered.lastEntryStatus)
      ) {
        idempotencyKey = null;
      }
      if (recovered?.status === 'MATCHED' && !activeMatchedGame) {
        idempotencyKey = null;
      }
      if (activeMatchedGame) {
        view = recovered;
        return view;
      }
      if (recovered?.status === 'WAITING') {
        if (recovered.category === category && recovered.language === language) {
          view = recovered;
          return view;
        }
        const cancelled = await api.cancel();
        if (cancelled?.status === 'MATCHED' &&
            !['COMPLETED', 'CANCELLED'].includes(cancelled.match?.status)) {
          view = cancelled;
          return view;
        }
        idempotencyKey = null;
      }
      if (!idempotencyKey) idempotencyKey = createKey();
      view = await api.enqueue({ category, language, idempotencyKey });
      return view;
    },
    async refresh() {
      view = await api.getMine();
      if (
        ['CANCELLED', 'EXPIRED'].includes(view?.status) ||
        (view?.status === 'NOT_QUEUED' && view.lastEntryStatus)
      ) {
        idempotencyKey = null;
      }
      return view;
    },
    async cancel() {
      view = await api.cancel();
      if (['NOT_QUEUED', 'CANCELLED', 'EXPIRED'].includes(view?.status)) {
        idempotencyKey = null;
      }
      return view;
    },
    getView: () => view,
    reset() { view = null; idempotencyKey = null; },
  };
}