import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, DEFAULT_PROFILE, normalizeProfile } from './data.js';
import { awardRun } from './scoring.js';
import { advanceChallenge, createChallenge, isPlayableChallenge, recordAnswer } from './session.js';

test('all challenge questions have four valid answer choices', () => {
  for (const category of CATEGORIES) {
    assert.ok(category.questions.length > 0, `${category.title} has questions`);
    for (const question of category.questions) {
      assert.equal(question.options.length, 4, `${category.title} question has four choices`);
      assert.ok(question.answer >= 0 && question.answer < question.options.length);
    }
  }
});

test('a correct and incorrect answer are scored once with answer feedback', () => {
  const category = CATEGORIES[0];
  const run = createChallenge(category, category.modes[0], 0, 'correctness');
  const correct = recordAnswer(run, category.questions[0].answer, 2);
  assert.equal(correct.correct, 1);
  assert.equal(correct.score, 25);
  assert.equal(correct.lastAnswer.correct, true);
  assert.equal(correct.lastAnswer.speedBonus, 15);

  const nextQuestion = advanceChallenge(correct);
  const incorrect = recordAnswer(nextQuestion, 0, 4);
  assert.equal(incorrect.correct, 1);
  assert.equal(incorrect.score, 25);
  assert.equal(incorrect.lastAnswer.correct, false);
  assert.equal(incorrect.lastAnswer.points, 0);
});

test('timeout records an unanswered question and blocks duplicate submissions', () => {
  const category = CATEGORIES[0];
  const run = createChallenge(category, category.modes[0], 0, 'timeout');
  const timedOut = recordAnswer(run, null, run.timeLimit, true);
  assert.equal(timedOut.answers[0].answerIndex, null);
  assert.equal(timedOut.answers[0].timedOut, true);
  assert.equal(timedOut.correct, 0);
  assert.equal(timedOut.score, -10);
  assert.equal(timedOut.answers[0].points, -10);
  assert.strictEqual(recordAnswer(timedOut, category.questions[0].answer, 1), timedOut);
  assert.strictEqual(recordAnswer(run, 99, 1), run);
});

test('challenge completion and replay produce independent clean runs', () => {
  const category = CATEGORIES[0];
  let run = createChallenge(category, category.modes[1], 1, 'first');
  assert.equal(run.timeLimit, 9);
  for (let index = 0; index < category.questions.length; index += 1) {
    run = recordAnswer(run, category.questions[index].answer, 6);
    run = advanceChallenge(run);
  }
  assert.equal(run.status, 'complete');
  assert.equal(run.correct, 3);
  assert.equal(run.total, 3);
  const replay = createChallenge(category, category.modes[1], 1, 'replay');
  assert.equal(replay.status, 'active');
  assert.equal(replay.score, 0);
  assert.equal(replay.answers.length, 0);
});

test('playable challenge validation rejects missing or inconsistent gameplay state', () => {
  const category = CATEGORIES[0];
  const run = createChallenge(category, category.modes[0], 0, 'playable');
  assert.equal(isPlayableChallenge(run), true);
  assert.equal(isPlayableChallenge({ ...run, questionIndex: 99 }), false);
  assert.equal(isPlayableChallenge({ ...run, questions: [] }), false);
  assert.equal(isPlayableChallenge({
    ...run,
    questions: [{ prompt: 'Question', options: [], answer: 0 }],
    total: 1,
  }), false);
  assert.equal(isPlayableChallenge({ ...run, timeLimit: 0 }), false);
  assert.equal(isPlayableChallenge({
    ...run,
    questions: [run.questions[0], { prompt: '', options: ['A', 'B'], answer: 0 }, ...run.questions.slice(2)],
  }), false);
  assert.equal(isPlayableChallenge({ ...run, answers: [{ correct: true }] }), false);
  assert.equal(isPlayableChallenge(null), false);
});

test('a run identifier cannot award XP or score twice', () => {
  const run = {
    runId: 'once-only',
    categoryId: 'memory',
    categoryTitle: 'Memory',
    mode: 'Pattern Recall',
    score: 50,
    correct: 2,
    total: 3,
    questions: CATEGORIES[0].questions,
  };
  const first = awardRun(normalizeProfile(DEFAULT_PROFILE), run);
  const duplicate = awardRun(first, run);
  assert.strictEqual(duplicate, first);
  assert.equal(duplicate.battles, 1);
  assert.equal(duplicate.totalXp, 10);
  assert.equal(duplicate.recentRuns[0].questions, undefined);
});

test('duplicate run rewards stay blocked after recent history is trimmed', () => {
  const run = {
    runId: 'old-run',
    categoryId: 'memory',
    categoryTitle: 'Memory',
    mode: 'Pattern Recall',
    score: 50,
    correct: 2,
    total: 3,
  };
  let profile = awardRun(normalizeProfile(DEFAULT_PROFILE), run);
  profile = {
    ...profile,
    recentRuns: Array.from({ length: 20 }, (_, index) => ({ runId: `newer-${index}` })),
  };
  assert.strictEqual(awardRun(profile, run), profile);
});
