import { MODE_TIMES } from './data.js';
import { scoreAnswer } from './scoring.js';

export function createChallenge(category, mode, modeIndex, runId) {
  return {
    runId,
    categoryId: category.id,
    categoryTitle: category.title,
    mode,
    modeIndex,
    timeLimit: MODE_TIMES[modeIndex] ?? MODE_TIMES[0],
    questions: category.questions,
    questionIndex: 0,
    answers: [],
    score: 0,
    correct: 0,
    total: category.questions.length,
    status: 'active',
    lastAnswer: null,
  };
}

export function isPlayableChallenge(run) {
  if (!run || run.status !== 'active'
      || !Number.isInteger(run.questionIndex)
      || !Array.isArray(run.questions)
      || run.questions.length === 0
      || run.total !== run.questions.length
      || !Number.isFinite(run.timeLimit)
      || run.timeLimit <= 0
      || run.questionIndex < 0
      || run.questionIndex >= run.questions.length
      || !Array.isArray(run.answers)
      || !run.questions.every((question) => typeof question?.prompt === 'string'
        && question.prompt.trim().length > 0
        && Array.isArray(question.options)
        && question.options.length > 1
        && question.options.every((option) => typeof option === 'string')
        && Number.isInteger(question.answer)
        && question.answer >= 0
        && question.answer < question.options.length)) return false;

  const answered = Boolean(run.lastAnswer);
  return run.answers.length === run.questionIndex + Number(answered)
    && (!answered || run.lastAnswer === run.answers[run.questionIndex]);
}

export function recordAnswer(run, answerIndex, elapsedSeconds, timedOut = false) {
  if (!run || run.status !== 'active' || run.answers.length !== run.questionIndex) return run;

  const question = run.questions[run.questionIndex];
  if (!question || (timedOut ? answerIndex !== null : !Number.isInteger(answerIndex)
      || answerIndex < 0 || answerIndex >= question.options.length)) return run;

  const correct = !timedOut && answerIndex === question.answer;
  const points = scoreAnswer(correct, elapsedSeconds, timedOut);
  const answer = {
    answerIndex,
    correct,
    correctIndex: question.answer,
    elapsedSeconds,
    timedOut,
    points: points.total,
    speedBonus: points.speedBonus,
  };

  return {
    ...run,
    answers: [...run.answers, answer],
    score: run.score + points.total,
    correct: run.correct + Number(correct),
    lastAnswer: answer,
  };
}

export function advanceChallenge(run) {
  if (!run || run.status !== 'active' || run.answers.length !== run.questionIndex + 1) return run;
  if (run.questionIndex + 1 === run.total) {
    return { ...run, status: 'complete', completedAt: Date.now(), lastAnswer: null };
  }
  return { ...run, questionIndex: run.questionIndex + 1, lastAnswer: null };
}
