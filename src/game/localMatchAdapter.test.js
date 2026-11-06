import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES } from './data.js';
import { createLocalMatchAdapter } from './localMatchAdapter.js';

test('local 1v1 adapter switches turns without exposing private question data', () => {
  const adapter = createLocalMatchAdapter();
  let view = adapter.start({
    category: CATEGORIES[0],
    mode: '1v1',
    matchId: 'local-1v1',
    language: 'en',
  });
  assert.equal(view.phase, 'question');
  assert.deepEqual(view.participants.map(({ type }) => type), ['human', 'human']);
  assert.equal(view.question.options[0].id, 'option-0');
  assert.equal('answerKey' in view.question, false);
  assert.equal('gradingRubric' in view.question, false);
  assert.equal('questionPackages' in view, false);

  view = adapter.submitOption('option-2', 2000);
  assert.equal(view.phase, 'handoff');
  assert.equal(view.question, null);
  assert.equal(view.participants[0].score, 25);
  view = adapter.continue();
  assert.equal(view.phase, 'question');
  assert.equal(view.activeParticipantId, 'human-2');
  assert.equal(view.question.roundIndex, 0);

  view = adapter.submitOption('option-0', 4000);
  assert.equal(view.phase, 'round-summary');
  assert.equal(view.roundIndex, 1);
  assert.equal(view.roundSummary.length, 2);
  assert.equal(view.roundSummary[0].decision, 'correct');
  assert.equal(view.roundSummary[1].decision, 'incorrect');
  assert.equal('answerKey' in view.roundSummary[0], false);
});

test('local 1vAI adapter runs against an explicitly scripted preview opponent', () => {
  const adapter = createLocalMatchAdapter();
  let view = adapter.start({
    category: CATEGORIES[0],
    mode: '1vAI',
    matchId: 'local-1vai',
    language: 'fa',
  });
  assert.equal(view.question.prompt, 'نشانه: مثلث · شش‌ضلعی · دایره · شش‌ضلعی. کدام شکل تکرار شده است؟');
  assert.deepEqual(view.participants.map(({ type }) => type), ['human', 'ai']);
  assert.match(view.participants[1].displayName, /Scripted opponent/);

  view = adapter.submitOption('option-2', 2000);
  assert.equal(view.phase, 'round-summary');
  assert.equal(view.roundIndex, 1);
  assert.equal(view.roundSummary.length, 2);
  assert.equal(view.participants[0].score, 25);
  assert.equal(view.participants[1].score, 0);
  assert.equal(view.question, null);
  view = adapter.continue();
  assert.equal(view.question.prompt, 'الگو را به خاطر بسپار: فیروزه‌ای، طلایی، صورتی. مورد دوم چه بود؟');
});

test('completes every scripted-preview round and returns a sanitized final result', () => {
  const adapter = createLocalMatchAdapter();
  let view = adapter.start({
    category: CATEGORIES[0],
    mode: '1vAI',
    matchId: 'local-complete',
  });
  for (let round = 0; round < view.totalRounds; round += 1) {
    view = adapter.submitOption(view.question.options[0].id, 2000);
    if (view.phase === 'round-summary') view = adapter.continue();
  }
  assert.equal(view.status, 'complete');
  assert.equal(view.phase, 'complete');
  assert.equal(view.roundIndex, view.totalRounds - 1);
  assert.equal(view.winnerId, null);
  assert.equal('questionPackages' in view, false);
  assert.equal('answerKey' in view, false);
  assert.equal('gradingRubric' in view, false);
});

test('supports no-response penalties, third-strike completion, and reset', () => {
  const adapter = createLocalMatchAdapter();
  let view = adapter.start({
    category: CATEGORIES[0],
    mode: '1vAI',
    matchId: 'local-timeout',
  });
  view = adapter.submitNoResponse();
  assert.equal(view.phase, 'round-summary');
  assert.equal(view.participants[0].score, -5);
  view = adapter.continue();

  view = adapter.submitNoResponse();
  view = adapter.continue();
  view = adapter.submitNoResponse();
  assert.equal(view.status, 'complete');
  assert.equal(view.winnerId, 'scripted-opponent');
  assert.equal(view.participants[0].score, -20);
  assert.equal(view.participants[1].score, 20);
  adapter.reset();
  assert.equal(adapter.getView(), null);
});

test('rejects invalid local adapter transitions and option IDs', () => {
  const adapter = createLocalMatchAdapter();
  assert.throws(() => adapter.continue(), RangeError);
  adapter.start({
    category: CATEGORIES[0],
    mode: '1v1',
    matchId: 'local-invalid',
  });
  assert.throws(() => adapter.submitOption('unknown-option', 1000), RangeError);
});
