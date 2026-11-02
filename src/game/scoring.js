import { CATEGORIES } from './data.js';

export function xpForNextLevel(level) {
  return 100 + Math.max(0, level - 1) * 40;
}

export function scoreAnswer(isCorrect, elapsedSeconds, timedOut = false) {
  if (timedOut) return { base: -10, speedBonus: 0, total: -10 };
  if (!isCorrect) return { base: 0, speedBonus: 0, total: 0 };
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const speedBonus = elapsed < 3 ? 15 : elapsed < 5 ? 10 : elapsed < 7 ? 5 : 2;
  return { base: 10, speedBonus, total: 10 + speedBonus };
}

export function remainingTime(timeLimit, elapsedSeconds) {
  return Math.max(0, timeLimit - Math.max(0, elapsedSeconds));
}

export function awardRun(profile, run) {
  if (run.runId && (profile.claimedRunIds?.includes(run.runId)
      || profile.recentRuns.some((savedRun) => savedRun.runId === run.runId))) return profile;
  const earnedXp = Math.floor(Math.max(0, run.score) / 5);
  let level = Math.max(1, profile.level);
  let xp = Math.max(0, profile.xp) + earnedXp;
  while (xp >= xpForNextLevel(level)) {
    xp -= xpForNextLevel(level);
    level += 1;
  }
  const previous = profile.categoryStats?.[run.categoryId] ?? { battles: 0, bestScore: 0, correctAnswers: 0, totalAnswers: 0 };
  const { questions, ...runSummary } = run;
  const completed = {
    ...runSummary,
    playerName: profile.playerName,
    level,
    xpEarned: earnedXp,
    incorrect: Math.max(0, run.total - run.correct),
    completedAt: run.completedAt ?? Date.now(),
  };
  return {
    ...profile,
    level,
    xp,
    totalXp: profile.totalXp + earnedXp,
    latestScore: run.score,
    bestScore: Math.max(profile.bestScore, run.score),
    battles: profile.battles + 1,
    correctAnswers: profile.correctAnswers + run.correct,
    totalAnswers: profile.totalAnswers + run.total,
    categoryStats: {
      ...profile.categoryStats,
      [run.categoryId]: {
        battles: previous.battles + 1,
        bestScore: Math.max(previous.bestScore, run.score),
        correctAnswers: previous.correctAnswers + run.correct,
        totalAnswers: previous.totalAnswers + run.total,
      },
    },
    recentRuns: [completed, ...profile.recentRuns].slice(0, 20),
    claimedRunIds: run.runId
      ? [...new Set([...(profile.claimedRunIds ?? []), run.runId])]
      : (profile.claimedRunIds ?? []),
  };
}

export function isValidAnswer(question, answerIndex) {
  return Number.isInteger(answerIndex)
    && answerIndex >= 0
    && answerIndex < question.options.length;
}

export function categoryById(categoryId) {
  return CATEGORIES.find((category) => category.id === categoryId) ?? null;
}