import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgressionApi, RANKING_MODES } from './progressionApi.js';

test('createProgressionApi requires a configured HTTP client', () => {
  assert.throws(
    () => createProgressionApi(null),
    /A configured HTTP client is required/,
  );
});

test('exposes exactly three independent server-authoritative ranking routes', () => {
  assert.deepEqual(RANKING_MODES, {
    '1v1': '/ranking/1v1',
    '1vAI': '/ranking/1vAI',
    'quick-battle': '/ranking/quick-battle',
  });
});

test('reads progression and each competitive mode ranking independently', async () => {
  const calls = [];
  const http = {
    get: async (path) => {
      calls.push(path);
      return { path };
    },
  };
  const api = createProgressionApi(http);

  assert.deepEqual(await api.getMyProgress(), { path: '/progression/me' });
  for (const [mode, path] of Object.entries(RANKING_MODES)) {
    assert.deepEqual(await api.getModeRanking(mode), { path });
  }
  assert.deepEqual(calls, [
    '/progression/me',
    '/ranking/1v1',
    '/ranking/1vAI',
    '/ranking/quick-battle',
  ]);
});

test('rejects unsupported ranking modes instead of guessing a route', () => {
  const api = createProgressionApi({ get: async () => ({}) });
  assert.throws(() => api.getModeRanking('seasonal'), /Unsupported ranking mode/);
});
