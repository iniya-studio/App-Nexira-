import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completeLanguageSelection,
  hasCompletedLanguageSelection,
  LANGUAGE_SELECTION_KEY,
} from './data.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test('a fresh install requires an explicit language selection', () => {
  const storage = createStorage();
  assert.equal(hasCompletedLanguageSelection(storage), false);
});

test('choosing a language marks the first-run selection as complete', () => {
  const storage = createStorage();
  assert.equal(completeLanguageSelection(storage), true);
  assert.equal(storage.getItem(LANGUAGE_SELECTION_KEY), 'completed');
  assert.equal(hasCompletedLanguageSelection(storage), true);
});

test('language selection remains complete on subsequent launches', () => {
  const storage = createStorage({ [LANGUAGE_SELECTION_KEY]: 'completed' });
  assert.equal(hasCompletedLanguageSelection(storage), true);
});

test('unavailable storage safely falls back to requiring language selection', () => {
  const storage = {
    getItem() { throw new Error('storage unavailable'); },
    setItem() { throw new Error('storage unavailable'); },
  };
  assert.equal(hasCompletedLanguageSelection(storage), false);
  assert.equal(completeLanguageSelection(storage), false);
});
