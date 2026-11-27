import {
  AnswerStatus, JudgeDecision, JudgeStatus, QuickBattleStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QuickBattleResultFinalizationWorker } from './quick-battle-result-finalization.worker';
import { QUICK_BATTLE_SCORING_POLICY_VERSION } from './quick-battle-scoring.policy';

describe('QuickBattleResultFinalizationWorker', () => {
  function makeRounds() {
    return Array.from({ length: 10 }, (_, index) => {
      const kind = index < 4 ? 'CORRECT' : index < 7 ? 'INCORRECT' : 'NO_RESPONSE';
      const answer = {
        id: `answer-${index + 1}`,
        status: kind === 'NO_RESPONSE' ? AnswerStatus.NO_RESPONSE : AnswerStatus.ANSWERED,
        judgeStatus: kind === 'NO_RESPONSE' ? JudgeStatus.NOT_REQUIRED : JudgeStatus.COMPLETED,
        decision: kind === 'CORRECT' ? JudgeDecision.CORRECT
          : kind === 'INCORRECT' ? JudgeDecision.INCORRECT : null,
        elapsedMs: kind === 'NO_RESPONSE' ? 30000 : kind === 'CORRECT' ? 15000 : 1000,
        points: null as number | null,
      };
      return {
        id: `round-${index + 1}`,
        roundNumber: index + 1,
        completedAt: new Date('2026-11-27T00:01:00.000Z'),
        voidedAt: null,
        question: { timeLimitSeconds: 30 },
        answer,
      };
    });
  }

  function setup(overrides: { result?: unknown; rounds?: ReturnType<typeof makeRounds> } = {}) {
    const rounds = overrides.rounds ?? makeRounds();
    const match = {
      id: 'match-1',
      status: QuickBattleStatus.COMPLETED,
      scoringPolicyVersion: QUICK_BATTLE_SCORING_POLICY_VERSION,
      roundsTarget: 10,
      completedAt: new Date('2026-11-27T00:01:00.000Z'),
      result: overrides.result ?? null,
      rounds,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      quickBattleMatch: {
        findUnique: jest.fn().mockResolvedValue(match),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      quickBattleAnswer: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
      },
      quickBattleResult: { create: jest.fn().mockResolvedValue({ id: 'result-1' }) },
    };
    const prisma = {
      quickBattleMatch: { findFirst: jest.fn().mockResolvedValue({ id: 'match-1' }) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    return { worker: new QuickBattleResultFinalizationWorker(prisma), prisma, tx, match };
  }

  it('atomically writes per-round points and one immutable ten-round result', async () => {
    const { worker, tx } = setup();
    await expect(worker.runOnce()).resolves.toBe(true);

    expect(tx.quickBattleAnswer.updateMany).toHaveBeenCalledTimes(10);
    expect(tx.quickBattleResult.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        matchId: 'match-1',
        scoringPolicyVersion: QUICK_BATTLE_SCORING_POLICY_VERSION,
        totalPoints: 500,
        correctAnswers: 4,
        incorrectAnswers: 3,
        noResponseCount: 3,
      }),
    });
  });

  it('reconciles and preserves an already finalized result on retry', async () => {
    const rounds = makeRounds();
    for (const round of rounds) {
      round.answer.points = round.answer.status === AnswerStatus.NO_RESPONSE ? 0
        : round.answer.decision === JudgeDecision.CORRECT ? 125 : 0;
    }
    const { worker, tx } = setup({
      rounds,
      result: {
        scoringPolicyVersion: QUICK_BATTLE_SCORING_POLICY_VERSION,
        totalPoints: 500,
        correctAnswers: 4,
        incorrectAnswers: 3,
        noResponseCount: 3,
      },
    });
    await expect(worker.runOnce()).resolves.toBe(true);
    expect(tx.quickBattleAnswer.updateMany).not.toHaveBeenCalled();
    expect(tx.quickBattleResult.create).not.toHaveBeenCalled();
  });

  it('technically voids a completed match with a missing terminal round outcome', async () => {
    const rounds = makeRounds();
    rounds[9].answer = null as never;
    const { worker, tx } = setup({ rounds });
    await expect(worker.runOnce()).resolves.toBe(false);
    expect(tx.quickBattleMatch.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'match-1',
        status: QuickBattleStatus.COMPLETED,
        voidedAt: null,
        result: { is: null },
      },
      data: {
        status: QuickBattleStatus.VOIDED,
        voidedAt: expect.any(Date),
        voidReason: 'QB_RESULT_INCOMPLETE_ROUND',
      },
    });
    expect(tx.quickBattleResult.create).not.toHaveBeenCalled();
  });

  it('does not select a match that has no approved scoring policy', async () => {
    const { worker, prisma } = setup();
    (prisma.quickBattleMatch.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(worker.runOnce()).resolves.toBe(false);
  });
});
