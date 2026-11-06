import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatch,
  getPublicQuestion,
  isValidMatch,
  recordMatchResult,
  startMatch,
} from './match.js';

const questionPackages = [
  {
    questionId: 'q-1',
    matchId: 'match-1',
    roundIndex: 0,
    canonicalLanguage: 'en',
    canonicalPrompt: 'Which planet is known as the Red Planet?',
    canonicalOptions: [
      { id: 'a', text: 'Mars' },
      { id: 'b', text: 'Venus' },
    ],
    answerType: 'multiple_choice',
    answerKey: 'a',
    gradingRubric: { rule: 'Exact option ID match.' },
    localized: {
      en: {
        prompt: 'Which planet is known as the Red Planet?',
        options: [{ id: 'a', text: 'Mars' }, { id: 'b', text: 'Venus' }],
      },
      fa: {
        prompt: 'کدام سیاره به سیاره سرخ معروف است؟',
        options: [{ id: 'a', text: 'مریخ' }, { id: 'b', text: 'زهره' }],
      },
    },
    timeLimit: 10,
    contentVersion: '1',
  },
  {
    questionId: 'q-2',
    matchId: 'match-1',
    roundIndex: 1,
    canonicalLanguage: 'en',
    canonicalPrompt: 'What is 2 + 2?',
    canonicalOptions: [
      { id: 'a', text: '4' },
      { id: 'b', text: '5' },
    ],
    answerType: 'multiple_choice',
    answerKey: 'a',
    gradingRubric: { rule: 'Exact option ID match.' },
    localized: {
      en: {
        prompt: 'What is 2 + 2?',
        options: [{ id: 'a', text: '4' }, { id: 'b', text: '5' }],
      },
      fa: {
        prompt: 'حاصل ۲ + ۲ چند است؟',
        options: [{ id: 'a', text: '۴' }, { id: 'b', text: '۵' }],
      },
    },
    timeLimit: 10,
    contentVersion: '1',
  },
  {
    questionId: 'q-3',
    matchId: 'match-1',
    roundIndex: 2,
    canonicalLanguage: 'en',
    canonicalPrompt: 'Name the largest ocean.',
    canonicalOptions: [],
    answerType: 'free_text',
    answerKey: 'Pacific Ocean',
    gradingRubric: { rule: 'Accept semantically equivalent names for the Pacific Ocean.' },
    localized: {
      en: { prompt: 'Name the largest ocean.', options: [] },
      fa: { prompt: 'بزرگ‌ترین اقیانوس را نام ببرید.', options: [] },
    },
    timeLimit: 10,
    contentVersion: '1',
  },
];

function makeMatch(mode = '1v1') {
  const participants = mode === '1v1'
    ? [
      { id: 'human-a', type: 'human', language: 'en' },
      { id: 'human-b', type: 'human', language: 'fa' },
    ]
    : [
      { id: 'human-a', type: 'human', language: 'en' },
      { id: 'ai-a', type: 'ai', language: 'fa' },
    ];

  return createMatch({
    matchId: 'match-1',
    mode,
    participants,
    questionPackages,
    timeLimit: 10,
  });
}

function answer(decision, elapsedMs = 2000, confidence = 0.99) {
  return {
    status: 'answered',
    adjudication: { decision, confidence },
    elapsedMs,
  };
}

function submit(match, id, result) {
  return recordMatchResult(match, id, result);
}

test('creates valid 1v1 and 1vAI matches with shared dynamic question packages', () => {
  for (const mode of ['1v1', '1vAI']) {
    const match = makeMatch(mode);
    assert.equal(isValidMatch(match), true);
    assert.equal(match.status, 'ready');
    assert.equal(match.questionPackages.length, 3);
    assert.deepEqual(match.participants.map(({ type }) => type),
      mode === '1v1' ? ['human', 'human'] : ['human', 'ai']);
  }
});

test('rejects invalid participant rosters and malformed or mismatched question packages', () => {
  const base = {
    matchId: 'match-1',
    mode: '1v1',
    participants: [
      { id: 'a', type: 'human' },
      { id: 'b', type: 'human' },
    ],
    questionPackages,
    timeLimit: 10,
  };

  assert.throws(() => createMatch({
    ...base,
    participants: [{ id: 'a', type: 'human' }, { id: 'b', type: 'ai' }],
  }), TypeError);

  const invalid = structuredClone(questionPackages);
  invalid[0].localized.fa.options[0].id = 'different-id';
  assert.throws(() => createMatch({ ...base, questionPackages: invalid }), TypeError);

  assert.throws(() => createMatch({
    ...base,
    questionPackages: [{ ...questionPackages[0], matchId: 'another-match' }],
  }), TypeError);
});

test('rejects question packages without their canonical locale and duplicate question IDs', () => {
  const base = {
    matchId: 'match-1',
    mode: '1v1',
    participants: [
      { id: 'a', type: 'human' },
      { id: 'b', type: 'human' },
    ],
    questionPackages,
    timeLimit: 10,
  };

  const missingCanonicalLanguage = structuredClone(questionPackages);
  delete missingCanonicalLanguage[0].localized.en;
  assert.throws(() => createMatch({
    ...base,
    questionPackages: missingCanonicalLanguage,
  }), TypeError);

  const duplicateQuestionIds = structuredClone(questionPackages);
  duplicateQuestionIds[1].questionId = duplicateQuestionIds[0].questionId;
  assert.throws(() => createMatch({
    ...base,
    questionPackages: duplicateQuestionIds,
  }), TypeError);
});

test('rejects corrupted Judge confidence and no-response confidence in stored history', () => {
  let match = startMatch(makeMatch());
  match = submit(match, 'human-a', answer('correct'));

  const invalidAnsweredParticipants = [...match.participants];
  invalidAnsweredParticipants[0] = {
    ...invalidAnsweredParticipants[0],
    answers: invalidAnsweredParticipants[0].answers.map((item) => ({
      ...item,
      confidence: 1.5,
    })),
  };
  assert.equal(isValidMatch({
    ...match,
    participants: invalidAnsweredParticipants,
  }), false);

  let noResponseMatch = startMatch(makeMatch());
  noResponseMatch = submit(noResponseMatch, 'human-a', { status: 'no-response', elapsedMs: 10000 });
  const invalidNoResponseParticipants = [...noResponseMatch.participants];
  invalidNoResponseParticipants[0] = {
    ...invalidNoResponseParticipants[0],
    answers: invalidNoResponseParticipants[0].answers.map((item) => ({
      ...item,
      confidence: 0.5,
    })),
  };
  assert.equal(isValidMatch({
    ...noResponseMatch,
    participants: invalidNoResponseParticipants,
  }), false);
});

test('returns localized public questions with stable option IDs and no answer key or rubric', () => {
  const match = makeMatch();
  const english = getPublicQuestion(match, 'human-a');
  const persian = getPublicQuestion(match, 'human-b');

  assert.equal(english.prompt, 'Which planet is known as the Red Planet?');
  assert.equal(persian.prompt, 'کدام سیاره به سیاره سرخ معروف است؟');
  assert.deepEqual(english.options.map(({ id }) => id), ['a', 'b']);
  assert.deepEqual(persian.options.map(({ id }) => id), ['a', 'b']);
  assert.equal('answerKey' in persian, false);
  assert.equal('gradingRubric' in persian, false);
  assert.equal('canonicalPrompt' in persian, false);
});

test('falls back to the canonical language when a participant translation is missing', () => {
  const match = makeMatch();
  const publicQuestion = getPublicQuestion(match, 'human-a', 'de');
  assert.equal(publicQuestion.language, 'en');
  assert.equal(publicQuestion.prompt, questionPackages[0].canonicalPrompt);
});

test('starts the match, accepts trusted Judge decisions, and advances only after both submissions', () => {
  let match = startMatch(makeMatch());
  match = submit(match, 'human-a', answer('correct', 2000));
  assert.equal(match.roundIndex, 0);
  assert.equal(match.participants[0].score, 25);

  match = submit(match, 'human-b', answer('incorrect', 2000));
  assert.equal(match.roundIndex, 1);
  assert.equal(match.status, 'active');
  assert.equal(isValidMatch(match), true);
});

test('uncertain is a valid adjudication but never receives correct-answer points', () => {
  let match = startMatch(makeMatch());
  match = submit(match, 'human-a', answer('uncertain', 1000, 0.42));
  assert.equal(match.participants[0].score, 0);
  assert.equal(match.participants[0].answers[0].decision, 'uncertain');
  assert.equal(match.participants[0].consecutiveNoResponses, 0);
  match = submit(match, 'human-b', answer('incorrect'));
  assert.equal(match.roundIndex, 1);
  assert.equal(isValidMatch(match), true);
});

test('supports free-text question packages in later rounds', () => {
  let match = startMatch(makeMatch());
  match = submit(match, 'human-a', answer('correct'));
  match = submit(match, 'human-b', answer('incorrect'));
  match = submit(match, 'human-a', answer('correct'));
  match = submit(match, 'human-b', answer('correct'));
  const publicQuestion = getPublicQuestion(match, 'human-b');
  assert.equal(publicQuestion.answerType, 'free_text');
  assert.equal(publicQuestion.prompt, 'بزرگ‌ترین اقیانوس را نام ببرید.');
  assert.deepEqual(publicQuestion.options, []);
  assert.equal('answerKey' in publicQuestion, false);
});

test('scores correct answers by speed and incorrect or uncertain answers as zero', () => {
  let match = startMatch(makeMatch());
  match = submit(match, 'human-a', answer('correct', 2000));
  assert.equal(match.participants[0].answers[0].points, 25);
  match = submit(match, 'human-b', answer('incorrect', 2000));
  assert.equal(match.participants[1].answers[0].points, 0);
});

test('rejects duplicate submissions, invalid decisions, invalid confidence and elapsed time', () => {
  assert.throws(() => submit(startMatch(makeMatch()), 'human-a', {
    status: 'no-response',
    elapsedMs: 9999,
  }), TypeError);

  let match = startMatch(makeMatch());
  match = submit(match, 'human-a', answer('correct'));
  assert.throws(() => submit(match, 'human-a', answer('incorrect')), RangeError);
  assert.throws(() => submit(match, 'human-b', answer('maybe')), TypeError);
  assert.throws(() => submit(match, 'human-b', answer('correct', 11000)), TypeError);
  assert.throws(() => submit(match, 'human-b', answer('correct', 1000, 1.5)), TypeError);
  assert.throws(() => submit(match, 'unknown', { status: 'no-response', elapsedMs: 10000 }), RangeError);
});

test('charges consecutive no-responses and resets the streak after any adjudicated answer', () => {
  let match = startMatch(makeMatch());
  match = submit(match, 'human-a', { status: 'no-response', elapsedMs: 10000 });
  assert.equal(match.participants[0].answers[0].elapsedMs, 10000);
  assert.equal(match.participants[0].score, -5);
  match = submit(match, 'human-b', answer('incorrect'));
  match = submit(match, 'human-a', { status: 'no-response', elapsedMs: 10000 });
  assert.equal(match.participants[0].score, -10);
  match = submit(match, 'human-b', answer('uncertain'));
  match = submit(match, 'human-a', answer('incorrect'));
  assert.equal(match.participants[0].consecutiveNoResponses, 0);
  assert.equal(match.roundIndex, 2);
  assert.equal(isValidMatch(match), true);
});

test('third consecutive no-response ends the match and transfers 20 points exactly once', () => {
  let match = startMatch(makeMatch());
  match = submit(match, 'human-a', { status: 'no-response', elapsedMs: 10000 });
  match = submit(match, 'human-b', answer('incorrect'));
  match = submit(match, 'human-a', { status: 'no-response', elapsedMs: 10000 });
  match = submit(match, 'human-b', answer('incorrect'));
  match = submit(match, 'human-a', { status: 'no-response', elapsedMs: 10000 });

  assert.equal(match.status, 'complete');
  assert.equal(match.endReason, 'three-consecutive-no-responses');
  assert.equal(match.winnerId, 'human-b');
  assert.equal(match.participants[0].score, -20);
  assert.equal(match.participants[1].score, 20);
  assert.deepEqual(match.forfeitTransfer, {
    fromParticipantId: 'human-a',
    toParticipantId: 'human-b',
    points: 20,
  });
  assert.equal(isValidMatch(match), true);
  assert.throws(() => submit(match, 'human-a', { status: 'no-response', elapsedMs: 10000 }), RangeError);
});

test('completes all rounds and selects the score-based winner', () => {
  let match = startMatch(makeMatch('1vAI'));
  for (let round = 0; round < questionPackages.length; round += 1) {
    match = submit(match, 'human-a', answer(round === 1 ? 'incorrect' : 'correct', 2000));
    match = submit(match, 'ai-a', answer('incorrect', 2000));
  }
  assert.equal(match.status, 'complete');
  assert.equal(match.endReason, 'questions-complete');
  assert.equal(match.winnerId, 'human-a');
  assert.equal(isValidMatch(match), true);
});

test('declares a draw when final scores are equal and rejects corrupted states', () => {
  let match = startMatch(makeMatch());
  for (let round = 0; round < questionPackages.length; round += 1) {
    match = submit(match, 'human-a', answer('incorrect'));
    match = submit(match, 'human-b', answer('incorrect'));
  }
  assert.equal(match.status, 'complete');
  assert.equal(match.winnerId, null);
  assert.equal(isValidMatch(match), true);
  assert.equal(isValidMatch({ ...match, roundIndex: 0 }), false);
  assert.equal(isValidMatch({
    ...match,
    participants: [{ ...match.participants[0], score: 99 }, match.participants[1]],
  }), false);
});

test('does not mutate the supplied question packages', () => {
  const original = structuredClone(questionPackages);
  const match = makeMatch();
  match.questionPackages[0].localized.fa.options[0].text = 'تغییر آزمایشی';
  assert.deepEqual(questionPackages, original);
});
