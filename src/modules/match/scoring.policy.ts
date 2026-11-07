import { JudgeDecision } from '@prisma/client';

export const SCORING_POLICY_VERSION = 'v1-speed-bands-1';

export type AnswerScore = {
  decision: JudgeDecision;
  points: number;
  speedBonus: number;
  judgeReason: 'CANONICAL_OPTION_ID_MATCH' | 'CANONICAL_OPTION_ID_MISMATCH';
  judgeVersion: string;
};

export function calculateCorrectAnswerScore(elapsedMs: number): {
  basePoints: number;
  speedBonus: number;
  totalPoints: number;
} {
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('elapsedMs must be a non-negative safe integer');
  }

  const speedBonus =
    elapsedMs < 3_000 ? 15 :
    elapsedMs < 5_000 ? 10 :
    elapsedMs < 7_000 ? 5 : 2;

  return {
    basePoints: 10,
    speedBonus,
    totalPoints: 10 + speedBonus,
  };
}

/**
 * Deterministic V1 adjudication for multiple-choice answers.
 * Only canonical option IDs are compared; localized labels never affect correctness.
 */
export function judgeMultipleChoiceAnswer(
  submittedOptionId: string,
  correctOptionId: string,
  elapsedMs: number,
): AnswerScore {
  const correct = submittedOptionId === correctOptionId;

  if (!correct) {
    return {
      decision: JudgeDecision.INCORRECT,
      points: 0,
      speedBonus: 0,
      judgeReason: 'CANONICAL_OPTION_ID_MISMATCH',
      judgeVersion: 'mcq-exact-v1',
    };
  }

  const score = calculateCorrectAnswerScore(elapsedMs);
  return {
    decision: JudgeDecision.CORRECT,
    points: score.totalPoints,
    speedBonus: score.speedBonus,
    judgeReason: 'CANONICAL_OPTION_ID_MATCH',
    judgeVersion: 'mcq-exact-v1',
  };
}
