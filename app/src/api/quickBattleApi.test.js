import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickBattleApi } from './quickBattleApi.js';

test('Quick Battle API maps every dedicated backend endpoint and payload', async () => {
  const calls = [];
  const http = {
    get: async (path) => { calls.push({ method: 'GET', path }); return {}; },
    post: async (path, body) => { calls.push({ method: 'POST', path, body }); return {}; },
  };
  const api = createQuickBattleApi(http);
  await api.createOrRecover('fa');
  await api.getActive();
  await api.getMatch('match/1');
  await api.getCurrentRound('match/1');
  await api.submitAnswer('match/1', 3, 'answer', 'idempotency-123');
  await api.getResult('match/1');
  assert.deepEqual(calls, [
    { method: 'POST', path: '/quick-battles', body: { language: 'fa' } },
    { method: 'GET', path: '/quick-battles/active' },
    { method: 'GET', path: '/quick-battles/match%2F1' },
    { method: 'GET', path: '/quick-battles/match%2F1/current-round' },
    { method: 'POST', path: '/quick-battles/match%2F1/rounds/3/answers', body: { responseText: 'answer', idempotencyKey: 'idempotency-123' } },
    { method: 'GET', path: '/quick-battles/match%2F1/result' },
  ]);
});

test('Quick Battle API requires an HTTP client', () => {
  assert.throws(() => createQuickBattleApi(null), /HTTP client/);
});
