import test from 'node:test';
import assert from 'node:assert/strict';
import { isMatchDeadlineReached } from './matchDeadline.js';

test('recognizes an elapsed server deadline', () => {
  assert.equal(isMatchDeadlineReached('2026-11-17T10:00:00.000Z', Date.parse('2026-11-17T10:00:00.000Z')), true);
  assert.equal(isMatchDeadlineReached('2026-11-17T09:59:59.999Z', Date.parse('2026-11-17T10:00:00.000Z')), true);
});

test('does not reconcile a deadline that is still in the future', () => {
  assert.equal(isMatchDeadlineReached('2026-11-17T10:00:01.000Z', Date.parse('2026-11-17T10:00:00.000Z')), false);
});

test('treats missing or invalid deadline values as not elapsed', () => {
  assert.equal(isMatchDeadlineReached(null, 0), false);
  assert.equal(isMatchDeadlineReached('', 0), false);
  assert.equal(isMatchDeadlineReached('not-a-date', 0), false);
});
