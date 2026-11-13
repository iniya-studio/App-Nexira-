import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgressionApi } from './progressionApi.js';

test('createProgressionApi requires a configured HTTP client', () => {
  assert.throws(
    () => createProgressionApi(null),
    /A configured HTTP client is required/,
  );
});

test('reads server-authoritative progression and leaderboard resources', async () => {
  const calls = [];
  const http = {
    get: async (path) => {
      calls.push(path);
      return { path };
    },
  };
  const api = createProgressionApi(http);

  assert.deepEqual(await api.getMyProgress(), { path: '/progression/me' });
  assert.deepEqual(await api.getGlobalRanking(), { path: '/ranking/global' });
  assert.deepEqual(await api.getCurrentSeasonRanking(), {
    path: '/ranking/seasonal/current',
  });
  assert.deepEqual(calls, [
    '/progression/me',
    '/ranking/global',
    '/ranking/seasonal/current',
  ]);
});
