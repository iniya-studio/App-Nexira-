import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnlineMatchmakingAdapter } from './onlineMatchmakingAdapter.js';

test('keeps the enqueue idempotency key stable across retries', async () => {
  const calls = [];
  let statusReads = 0;
  const api = {
    enqueue: async (input) => { calls.push(input); return { status: 'WAITING', queueId: 'queue-1' }; },
    getMine: async () => { statusReads += 1; return statusReads <= 2 ? { status: 'NOT_QUEUED' } : { status: 'MATCHED', matchId: 'match-1' }; },
    cancel: async () => ({ status: 'CANCELLED' }),
  };
  const adapter = createOnlineMatchmakingAdapter(api, { createKey: () => 'stable-key-00000001' });
  await adapter.start({ category: 'science', language: 'fa' });
  await adapter.start({ category: 'science', language: 'fa' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
  assert.deepEqual(await adapter.refresh(), { status: 'MATCHED', matchId: 'match-1' });
  assert.deepEqual(await adapter.cancel(), { status: 'CANCELLED' });
});
test('starts a fresh queue after the previous matched game is terminal', async () => {
  let enqueueCalls = 0;
  const api = {
    getMine: async () => ({ status: 'MATCHED', matchId: 'old-match', match: { status: 'COMPLETED' } }),
    enqueue: async () => { enqueueCalls += 1; return { status: 'WAITING', queueId: 'new-queue' }; },
    cancel: async () => ({ status: 'CANCELLED' }),
  };
  const adapter = createOnlineMatchmakingAdapter(api);
  const result = await adapter.start({ category: 'science', language: 'en' });
  assert.equal(enqueueCalls, 1);
  assert.equal(result.queueId, 'new-queue');
});
test('replaces a waiting queue when the player selects a different category or language', async () => {
  const enqueued = [];
  let cancelCalls = 0;
  const api = {
    getMine: async () => ({ status: 'WAITING', category: 'memory', language: 'en', queueId: 'old-queue' }),
    cancel: async () => { cancelCalls += 1; return { status: 'CANCELLED' }; },
    enqueue: async (input) => { enqueued.push(input); return { status: 'WAITING', ...input, queueId: 'new-queue' }; },
  };
  const adapter = createOnlineMatchmakingAdapter(api);
  const result = await adapter.start({ category: 'science', language: 'fa' });

  assert.equal(cancelCalls, 1);
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].category, 'science');
  assert.equal(enqueued[0].language, 'fa');
  assert.equal(result.queueId, 'new-queue');
});
