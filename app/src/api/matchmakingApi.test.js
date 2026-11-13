import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchmakingApi } from './matchmakingApi.js';

test('matchmaking API maps enqueue, recovery and cancellation to queue endpoints', async () => {
  const calls = [];
  const http = {
    get: async (path) => { calls.push(['GET', path]); return { status: 'WAITING' }; },
    post: async (path, body) => { calls.push(['POST', path, body]); return { status: 'WAITING' }; },
    request: async (path, options) => { calls.push(['DELETE', path, options]); return { status: 'CANCELLED' }; },
  };
  const api = createMatchmakingApi(http);
  await api.enqueue({ category: 'science', language: 'fa', idempotencyKey: 'stable-key-00000001' });
  await api.getMine();
  await api.cancel();
  assert.deepEqual(calls.map(([method, path]) => [method, path]), [
    ['POST', '/matchmaking/queue'],
    ['GET', '/matchmaking/queue/me'],
    ['DELETE', '/matchmaking/queue/me'],
  ]);
});