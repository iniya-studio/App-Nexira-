import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROFILE, loadProfile, normalizeProfile, saveProfile, STORAGE_KEY } from './data.js';
import { awardRun, isValidAnswer, remainingTime, scoreAnswer, xpForNextLevel } from './scoring.js';

test('speed bonus uses exclusive thresholds, wrong answers score zero and timeout deducts base points', () => {
  assert.deepEqual(scoreAnswer(true, 2.99), { base: 10, speedBonus: 15, total: 25 });
  assert.equal(scoreAnswer(true, 3).total, 20);
  assert.equal(scoreAnswer(true, 5).total, 15);
  assert.equal(scoreAnswer(true, 7).total, 12);
  assert.deepEqual(scoreAnswer(false, 0.2), { base: 0, speedBonus: 0, total: 0 });
  assert.deepEqual(scoreAnswer(false, 15, true), { base: -10, speedBonus: 0, total: -10 });
});

test('countdown clamps elapsed time and never becomes negative', () => {
  assert.equal(remainingTime(15, 4), 11);
  assert.equal(remainingTime(15, 15), 0);
  assert.equal(remainingTime(15, 19), 0);
  assert.equal(remainingTime(15, -3), 15);
});

test('answer validation rejects invalid options', () => {
  const question = { options: ['A', 'B', 'C', 'D'] };
  assert.equal(isValidAnswer(question, 0), true);
  assert.equal(isValidAnswer(question, 3), true);
  assert.equal(isValidAnswer(question, -1), false);
  assert.equal(isValidAnswer(question, 4), false);
  assert.equal(isValidAnswer(question, 1.5), false);
});

test('XP level thresholds progress without losing overflow XP', () => {
  assert.equal(xpForNextLevel(1), 100);
  assert.equal(xpForNextLevel(2), 140);
  const profile = normalizeProfile({ ...DEFAULT_PROFILE, xp: 95 });
  const next = awardRun(profile, { categoryId: 'memory', categoryTitle: 'Memory', mode: 'Pattern Recall', score: 50, correct: 2, total: 3 });
  assert.equal(next.level, 2);
  assert.equal(next.xp, 5);
  assert.equal(next.totalXp, 10);
});

test('run results update local profile, category stats, and recent history once', () => {
  const run = { categoryId: 'logic', categoryTitle: 'Logic', mode: 'Deduction', score: 45, correct: 2, total: 3, completedAt: 123 };
  const next = awardRun(normalizeProfile(DEFAULT_PROFILE), run);
  assert.equal(next.battles, 1);
  assert.equal(next.latestScore, 45);
  assert.equal(next.bestScore, 45);
  assert.equal(next.categoryStats.logic.correctAnswers, 2);
  assert.equal(next.categoryStats.logic.totalAnswers, 3);
  assert.equal(next.recentRuns.length, 1);
  assert.equal(next.recentRuns[0].incorrect, 1);
  assert.equal(next.recentRuns[0].xpEarned, 9);
});

test('profile persistence tolerates malformed values and unavailable storage', () => {
  const values = new Map([[STORAGE_KEY, '{bad json']]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(loadProfile(storage).level, 1);
  assert.equal(loadProfile({ getItem: () => '[]' }).level, 1);
  assert.equal(saveProfile({ ...DEFAULT_PROFILE, level: -2 }, storage), true);
  assert.equal(loadProfile(storage).level, 1);
  assert.equal(saveProfile(DEFAULT_PROFILE, { setItem: () => { throw new Error('blocked'); } }), false);
});

test('profile persistence restores an earned level and saved settings', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const saved = normalizeProfile({
    ...DEFAULT_PROFILE,
    level: 3,
    xp: 12,
    totalXp: 252,
    settings: { ...DEFAULT_PROFILE.settings, language: 'fa', reducedMotion: true },
  });
  assert.equal(saveProfile(saved, storage), true);
  assert.deepEqual(loadProfile(storage), saved);
});