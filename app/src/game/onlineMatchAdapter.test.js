import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnlineMatchAdapter } from './onlineMatchAdapter.js';

function makeApi(overrides = {}) {
  const calls = [];
  const api = {
    createAiMatch: async (options) => { calls.push(['createAiMatch', options]); return { id: 'match-1', status: 'WAITING', roundsTarget: 10 }; },
    getMatch: async () => ({ id: 'match-1', status: 'WAITING', currentRound: 0, roundsTarget: 10 }),
    getQuestionRecovery: async () => ({ status: 'PENDING', roundId: null, ready: null }),
    markRoundReady: async () => ({ startedAt: '2026-11-13T10:00:00.000Z', deadlineAt: '2026-11-13T10:00:30.000Z' }),
    getRoundQuestion: async () => ({
      matchId: 'match-1', roundId: 'round-1', roundNumber: 1, questionId: 'question-1',
      answerType: 'FREE_TEXT', prompt: 'What is the capital of France?', options: [],
      timeLimitSeconds: 30, startedAt: '2026-11-13T10:00:00.000Z', deadlineAt: '2026-11-13T10:00:30.000Z',
    }),
    submitAnswer: async (...args) => { calls.push(['submitAnswer', ...args]); return { status: 'ACCEPTED' }; },
    getRoundResult: async () => ({ status: 'ACTIVE', participants: [] }),
    getMatchResult: async () => ({ completed: false }),
    ...overrides,
  };
  return { api, calls };
}

test('starts a server-owned 1vAI match with the selected category and language', async () => {
  const { api, calls } = makeApi();
  const adapter = createOnlineMatchAdapter(api);
  const view = await adapter.start({ category: 'science', language: 'fa' });
  assert.equal(view.matchId, 'match-1');
  assert.equal(view.isOnline, true);
  assert.equal(view.phase, 'waiting-question');
  assert.deepEqual(calls[0], ['createAiMatch', { category: 'science', language: 'fa' }]);
});

test('loads a generated question only after server readiness starts the shared clock', async () => {
  const startedAt = new Date(Date.now() - 1000).toISOString();
  const deadlineAt = new Date(Date.now() + 29_000).toISOString();
  const { api } = makeApi({
    getQuestionRecovery: async () => ({
      status: 'COMPLETED', roundId: 'round-1', ready: false, startedAt: null, deadlineAt: null,
    }),
  });
  const adapter = createOnlineMatchAdapter(api);
  await adapter.start({ category: 'logic', language: 'en' });
  const view = await adapter.refresh();
  assert.equal(view.phase, 'question');
  assert.equal(view.question.answerType, 'FREE_TEXT');
  assert.equal(view.question.roundId, 'round-1');
  assert.equal(view.deadlineAt, deadlineAt);
});

test('submits free-text answers with one stable idempotency key and waits for server adjudication', async () => {
  const startedAt = new Date(Date.now() - 1000).toISOString();
  const deadlineAt = new Date(Date.now() + 29_000).toISOString();
  const { api, calls } = makeApi({
    getQuestionRecovery: async () => ({
      status: 'COMPLETED', roundId: 'round-1', ready: true,
      startedAt, deadlineAt,
    }),
    getRoundQuestion: async () => ({
      matchId: 'match-1', roundId: 'round-1', roundNumber: 1, questionId: 'question-1',
      answerType: 'FREE_TEXT', prompt: 'What is the capital of France?', options: [],
      timeLimitSeconds: 30, startedAt, deadlineAt,
    }),
  });
  const adapter = createOnlineMatchAdapter(api, { createKey: () => 'stable-answer-key-123' });
  await adapter.start({ category: 'knowledge', language: 'en' });
  await adapter.refresh();
  const view = await adapter.submitAnswer('Paris');
  assert.equal(view.phase, 'waiting-result');
  assert.deepEqual(calls.find(([name]) => name === 'submitAnswer'), [
    'submitAnswer', 'match-1', 'round-1', 'Paris', 'stable-answer-key-123',
  ]);
  assert.equal(view.participants[0].score, 0);
});
