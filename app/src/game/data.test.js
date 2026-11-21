import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completeLanguageSelection,
  hasCompletedLanguageSelection,
  LANGUAGE_SELECTION_KEY,
  loadProfile,
  saveProfile,
  STORAGE_KEY,
  DEFAULT_PROFILE,
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

test('profile language and profile data survive a save-and-reload cycle', () => {
  const storage = createStorage();
  const profile = {
    ...DEFAULT_PROFILE,
    playerName: 'NEXIRA',
    level: 7,
    xp: 125,
    settings: { ...DEFAULT_PROFILE.settings, language: 'fa', sound: true },
  };

  assert.equal(saveProfile(profile, storage), true);
  const reloaded = loadProfile(storage);

  assert.equal(reloaded.playerName, 'NEXIRA');
  assert.equal(reloaded.level, 7);
  assert.equal(reloaded.xp, 125);
  assert.equal(reloaded.settings.language, 'fa');
  assert.equal(reloaded.settings.sound, true);
});

test('profile loading normalizes invalid and disabled locales to the default locale', () => {
  for (const language of ['xx-INVALID', 'ar']) {
    const storage = createStorage({
      [STORAGE_KEY]: JSON.stringify({
        ...DEFAULT_PROFILE,
        settings: { ...DEFAULT_PROFILE.settings, language },
      }),
    });

    assert.equal(loadProfile(storage).settings.language, 'en', language);
  }
});

test('corrupt profile JSON safely falls back to the default profile', () => {
  const storage = createStorage({ [STORAGE_KEY]: '{not valid json' });
  const profile = loadProfile(storage);

  assert.equal(profile.playerName, DEFAULT_PROFILE.playerName);
  assert.equal(profile.settings.language, 'en');
  assert.deepEqual(profile.settings, DEFAULT_PROFILE.settings);
});

test('profile loading safely falls back when storage access throws', () => {
  const storage = {
    getItem() { throw new Error('storage unavailable'); },
    setItem() { throw new Error('storage unavailable'); },
  };

  assert.equal(loadProfile(storage).settings.language, 'en');
  assert.equal(loadProfile(storage).playerName, DEFAULT_PROFILE.playerName);
});

test('profile save reports success only after storage accepts the value', () => {
  const storage = createStorage();
  assert.equal(saveProfile({ ...DEFAULT_PROFILE, settings: { language: 'fa' } }, storage), true);
  assert.doesNotThrow(() => JSON.parse(storage.getItem(STORAGE_KEY)));
});

test('profile save reports failure when storage rejects the write', () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error('quota exceeded'); },
  };

  assert.equal(saveProfile(DEFAULT_PROFILE, storage), false);
});
