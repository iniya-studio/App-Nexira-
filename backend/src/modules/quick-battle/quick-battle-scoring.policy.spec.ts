import { AnswerStatus, JudgeDecision, JudgeStatus } from '@prisma/client';
import {
  calculateQuickBattleRoundScore,
  QuickBattleScoringIntegrityError,
} from './quick-battle-scoring.policy';

describe('calculateQuickBattleRoundScore', () => {
  const correct = {
    status: AnswerStatus.ANSWERED,
    judgeStatus: JudgeStatus.COMPLETED,
    decision: JudgeDecision.CORRECT,
    elapsedMs: 0,
    timeLimitSeconds: 30,
  };

  it('awards the maximum 150 points for an immediate correct answer', () => {
    expect(calculateQuickBattleRoundScore(correct)).toEqual({ points: 150, outcome: 'CORRECT' });
  });

  it('awards 125 points at half of the answer window', () => {
    expect(calculateQuickBattleRoundScore({ ...correct, elapsedMs: 15000 }))
      .toEqual({ points: 125, outcome: 'CORRECT' });
  });

  it('uses integer floor rounding close to the deadline', () => {
    expect(calculateQuickBattleRoundScore({ ...correct, elapsedMs: 29000 }))
      .toEqual({ points: 101, outcome: 'CORRECT' });
    expect(calculateQuickBattleRoundScore({ ...correct, elapsedMs: 29999 }))
      .toEqual({ points: 100, outcome: 'CORRECT' });
  });

  it('keeps integer scoring exact at the maximum PostgreSQL integer time limit', () => {
    const timeLimitSeconds = 2_147_483_647;
    const totalMs = timeLimitSeconds * 1000;
    expect(calculateQuickBattleRoundScore({
      ...correct,
      timeLimitSeconds,
      elapsedMs: totalMs - 1,
    })).toEqual({ points: 100, outcome: 'CORRECT' });
  });

  it('awards zero for an incorrect terminal judge decision', () => {
    expect(calculateQuickBattleRoundScore({
      ...correct, decision: JudgeDecision.INCORRECT, elapsedMs: 100,
    })).toEqual({ points: 0, outcome: 'INCORRECT' });
  });

  it('awards zero for an explicit no-response outcome', () => {
    expect(calculateQuickBattleRoundScore({
      status: AnswerStatus.NO_RESPONSE,
      judgeStatus: JudgeStatus.NOT_REQUIRED,
      decision: null,
      elapsedMs: 30000,
      timeLimitSeconds: 30,
    })).toEqual({ points: 0, outcome: 'NO_RESPONSE' });
  });

  it.each([JudgeStatus.PENDING, JudgeStatus.PROCESSING, JudgeStatus.FAILED])(
    'rejects non-final judge state %s',
    (judgeStatus) => {
      expect(() => calculateQuickBattleRoundScore({ ...correct, judgeStatus }))
        .toThrow(QuickBattleScoringIntegrityError);
    },
  );

  it.each([
    { timeLimitSeconds: 0, elapsedMs: 0 },
    { timeLimitSeconds: 30, elapsedMs: -1 },
    { timeLimitSeconds: 30, elapsedMs: 30000 },
    { timeLimitSeconds: 30, elapsedMs: 30001 },
  ])('rejects invalid timing %#', (timing) => {
    expect(() => calculateQuickBattleRoundScore({ ...correct, ...timing }))
      .toThrow(QuickBattleScoringIntegrityError);
  });

  it('rejects an inconsistent no-response judge state', () => {
    expect(() => calculateQuickBattleRoundScore({
      status: AnswerStatus.NO_RESPONSE,
      judgeStatus: JudgeStatus.COMPLETED,
      decision: JudgeDecision.INCORRECT,
      elapsedMs: 30000,
      timeLimitSeconds: 30,
    })).toThrow(QuickBattleScoringIntegrityError);
  });
});
