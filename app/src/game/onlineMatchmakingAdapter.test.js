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