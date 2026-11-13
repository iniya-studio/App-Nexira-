export function createMatchmakingApi(http) {
  if (!http || typeof http.get !== 'function' || typeof http.post !== 'function' || typeof http.request !== 'function') {
    throw new TypeError('A configured HTTP client with GET, POST and request support is required.');
  }

  return {
    enqueue: (input) => http.post('/matchmaking/queue', input),
    getMine: () => http.get('/matchmaking/queue/me'),
    cancel: () => http.request('/matchmaking/queue/me', { method: 'DELETE' }),
  };
}