import { JudgeDecision } from '@prisma/client';
import {
  calculateCorrectAnswerScore,
  judgeMultipleChoiceAnswer,
} from './scoring.policy';

describe('V1 scoring policy', () => {
  it.each([
    [0, 15, 25],
    [2_999, 15, 25],
    [3_000, 10, 20],
    [4_999, 10, 20],
    [5_000, 5, 15],
    [6_999, 5, 15],
    [7_000, 2, 12],
    [30_000, 2, 12],
  ])('scores a correct answer at %i ms', (elapsedMs, speedBonus, totalPoints) => {
    expect(calculateCorrectAnswerScore(elapsedMs)).toEqual({
      basePoints: 10,
      speedBonus,
      totalPoints,
    });
  });

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid elapsed time %s',
    (elapsedMs) => {
      expect(() => calculateCorrectAnswerScore(elapsedMs)).toThrow(RangeError);
    },
  );

  it('awards base and speed points for the correct canonical option ID', () => {
    expect(judgeMultipleChoiceAnswer('B', 'B', 4_250)).toEqual({
      decision: JudgeDecision.CORRECT,
      points: 20,
      speedBonus: 10,
      judgeReason: 'CANONICAL_OPTION_ID_MATCH',
      judgeVersion: 'mcq-exact-v1',
    });
  });

  it('awards no points or speed bonus for an incorrect option', () => {
    expect(judgeMultipleChoiceAnswer('A', 'B', 500)).toEqual({
      decision: JudgeDecision.INCORRECT,
      points: 0,
      speedBonus: 0,
      judgeReason: 'CANONICAL_OPTION_ID_MISMATCH',
      judgeVersion: 'mcq-exact-v1',
    });
  });
});
