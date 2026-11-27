import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickBattleAdapter } from './quickBattleAdapter.js';

function createApi(overrides = {}) {
  const calls = [];
  const api = {
    createOrRecover: async (language) => ({ id: 'match-1', status: 'PREPARING', language, roundsTarget: 10, currentRound: 0 }),
    getMatch: async () => ({ id: 'match-1', status: 'ACTIVE', currentRound: 1, roundsTarget: 10 }),
    getCurrentRound: async () => ({
      matchId: 'match-1', matchStatus: 'ACTIVE', currentRound: 1, roundsTarget: 10,
      serverNow: new Date(Date.now()).toISOString(), state: 'ACTIVE',
      round: {
        roundNumber: 1, startedAt: new Date(Date.now()).toISOString(),
        deadlineAt: new Date(Date.now() + 30000).toISOString(),
        question: { prompt: 'What is 2 + 2?', answerType: 'FREE_TEXT', options: null, timeLimitSeconds: 30 },
        answer: null,
      },
    }),
    submitAnswer: async (...args) => { calls.push(args); return { status: 'ACCEPTED' }; },
    getResult: async () => ({ matchId: 'match-1', totalPoints: 0 }),
    ...overrides,
  };
  return { api, calls };
}

test('starts a server-owned ten-round match and exposes the published question', async () => {
  const { api } = createApi();
  const adapter = createQuickBattleAdapter(api);
  const view = await adapter.start('fa');
  assert.equal(view.matchId, 'match-1');
  assert.equal(view.totalRounds, 10);
  assert.equal(view.phase, 'question');
  assert.equal(view.question.prompt, 'What is 2 + 2?');
  assert.ok(adapter.getRemainingMs() > 0);
});

test('submits a free-text answer with a stable idempotency key and waits for server judging', async () => {
  const { api, calls } = createApi();
  const adapter = createQuickBattleAdapter(api, { createKey: () => 'stable-key-123' });
  await adapter.start('en');
  const view = await adapter.submitAnswer('four');
  assert.equal(view.phase, 'waiting-result');
  assert.deepEqual(calls, [['match-1', 1, 'four', 'stable-key-123']]);
});

test('retains and retries the exact same answer and idempotency key after a transport error', async () => {
  let attempts = 0;
  const { api, calls } = createApi({
    submitAnswer: async (...args) => {
      calls.push(args);
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' });
      return { status: 'ACCEPTED' };
    },
  });
  const adapter = createQuickBattleAdapter(api, { createKey: () => 'stable-key-123' });
  await adapter.start('en');
  await assert.rejects(adapter.submitAnswer('four'));
  assert.equal(adapter.getView().phase, 'submission-error');
  const retried = await adapter.retrySubmission();
  assert.equal(retried.phase, 'waiting-result');
  assert.deepEqual(calls, [
    ['match-1', 1, 'four', 'stable-key-123'],
    ['match-1', 1, 'four', 'stable-key-123'],
  ]);
});

test('finalizes the UI only from the immutable backend result', async () => {
  const { api } = createApi({
    getMatch: async () => ({ id: 'match-1', status: 'COMPLETED', currentRound: 10, roundsTarget: 10 }),
    getResult: async () => ({ matchId: 'match-1', totalPoints: 1200, correctAnswers: 9, incorrectAnswers: 1, noResponseCount: 0 }),
  });
  const adapter = createQuickBattleAdapter(api);
  await adapter.start('en');
  const view = await adapter.refresh();
  assert.equal(view.phase, 'complete');
  assert.equal(view.result.totalPoints, 1200);
});

test('does not convert a technical void into a competitive loss or score', async () => {
  const { api } = createApi({
    getMatch: async () => ({ id: 'match-1', status: 'VOIDED', currentRound: 4, roundsTarget: 10 }),
  });
  const adapter = createQuickBattleAdapter(api);
  const view = await adapter.start('en');
  assert.equal(view.phase, 'voided');
  assert.equal(view.result, null);
});
