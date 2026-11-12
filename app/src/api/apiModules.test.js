import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionApi } from './sessionApi.js';
import { createMatchApi } from './matchApi.js';

function createRecorder() {
  const calls = [];
  const http = {
    get: async (path, options) => { calls.push({ method: 'GET', path, options }); return {}; },
    post: async (path, body, options) => { calls.push({ method: 'POST', path, body, options }); return {}; },
  };
  return { calls, http };
}

test('session API uses the backend routes and keeps public auth requests unauthenticated', async () => {
  const { calls, http } = createRecorder();
  const api = createSessionApi(http);
  await api.startGuest();
  await api.login({ email: 'player@example.test', password: 'password' });
  await api.convertGuest({ email: 'player@example.test', password: 'password', username: 'player', displayName: 'Player' });
  await api.refresh('refresh-token', 'idempotency-key');
  await api.logout();

  assert.deepEqual(calls.map(({ method, path }) => [method, path]), [
    ['POST', '/guest/start'],
    ['POST', '/auth/login'],
    ['POST', '/guest/convert'],
    ['POST', '/sessions/refresh'],
    ['POST', '/sessions/logout'],
  ]);
  assert.equal(calls[0].options.authenticated, false);
  assert.equal(calls[1].options.authenticated, false);
  assert.deepEqual(calls[3].body, { refreshToken: 'refresh-token', idempotencyKey: 'idempotency-key' });
});

test('match API builds encoded routes and submits the exact backend DTO', async () => {
  const { calls, http } = createRecorder();
  const api = createMatchApi(http);
  await api.createAiMatch();
  await api.getRoundQuestion('match/id', 'round/id', 'fa-IR');
  await api.submitAnswer('match-id', 'round-id', 'option-2', 'stable-idempotency-key');

  assert.equal(calls[0].path, '/matches/ai');
  assert.equal(calls[1].path, '/matches/match%2Fid/rounds/round%2Fid/question?language=fa-IR');
  assert.deepEqual(calls[2].body, {
    responseText: 'option-2',
    idempotencyKey: 'stable-idempotency-key',
  });
});
