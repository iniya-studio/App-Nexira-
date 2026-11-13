import {
  AnswerStatus,
  JudgeDecision,
  JudgeStatus,
  MatchMode,
  MatchStatus,
  ParticipantStatus,
  ParticipantType,
  Prisma,
} from '@prisma/client';
import { MatchSettlementService } from './match-settlement.service';

describe('MatchSettlementService', () => {
  const completedAt = new Date('2026-11-14T10:00:00.000Z');

  function answer(decision: JudgeDecision, voidedAt: Date | null = null) {
    return {
      status: AnswerStatus.ANSWERED,
      decision,
      judgeStatus: JudgeStatus.COMPLETED,
      round: { voidedAt },
    };
  }

  function participant(
    id: string,
    userId: string | null,
    guestIdentityId: string | null,
    status: ParticipantStatus,
    answers: ReturnType<typeof answer>[] = [],
    participantType: ParticipantType = ParticipantType.HUMAN,
  ) {
    return {
      id,
      userId,
      guestIdentityId,
      participantType,
      status,
      guestIdentity: guestIdentityId ? { id: guestIdentityId, convertedToUserId: null } : null,
      answers,
    };
  }

  function transaction(match: Record<string, unknown>) {
    const tx = {
      match: { findUnique: jest.fn().mockResolvedValue(match) },
      rankingSeason: {
        findMany: jest.fn().mockResolvedValue([{ id: 'season-1' }]),
      },
      guestIdentity: {
        findUnique: jest.fn().mockResolvedValue({ id: 'guest-1', convertedToUserId: null }),
      },
      xPTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      userProgress: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      guestXPTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      guestProgress: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      rankingTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      globalUserRanking: { upsert: jest.fn().mockResolvedValue({}) },
      userRanking: { upsert: jest.fn().mockResolvedValue({}) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'locked-principal' }]),
    };
    return tx as unknown as Prisma.TransactionClient & typeof tx;
  }

  it('settles 1v1 XP and global/season ranking from persisted outcomes exactly once', async () => {
    const match = {
      id: 'match-1',
      mode: MatchMode.ONE_V_ONE,
      status: MatchStatus.COMPLETED,
      completedAt,
      result: { winnerParticipantId: 'participant-1' },
      participants: [
        participant('participant-1', 'user-1', null, ParticipantStatus.COMPLETED, [
          answer(JudgeDecision.CORRECT),
          answer(JudgeDecision.INCORRECT),
          answer(JudgeDecision.CORRECT, new Date()),
        ]),
        participant('participant-2', 'user-2', null, ParticipantStatus.COMPLETED, [
          answer(JudgeDecision.CORRECT),
          answer(JudgeDecision.INCORRECT),
        ]),
      ],
    };
    const tx = transaction(match);
    const service = new MatchSettlementService();

    await service.settleCompletedMatch(tx, 'match-1');

    expect(tx.xPTransaction.create).toHaveBeenNthCalledWith(1, {
      data: {
        userId: 'user-1',
        matchId: 'match-1',
        amount: 18,
        reason: 'MATCH_REWARD',
        idempotencyKey: 'match:match-1:user:user-1:xp:v1',
      },
    });
    expect(tx.xPTransaction.create).toHaveBeenNthCalledWith(2, {
      data: {
        userId: 'user-2',
        matchId: 'match-1',
        amount: 13,
        reason: 'MATCH_REWARD',
        idempotencyKey: 'match:match-1:user:user-2:xp:v1',
      },
    });
    expect(tx.rankingTransaction.create).toHaveBeenCalledTimes(4);
    expect(tx.globalUserRanking.upsert).toHaveBeenCalledTimes(2);
    expect(tx.userRanking.upsert).toHaveBeenCalledTimes(2);
    expect(tx.rankingTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        scope: 'GLOBAL',
        pointsChange: 20,
        reason: 'MATCH_WIN',
      }),
    });
    expect(tx.rankingTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-2',
        scope: 'SEASON',
        seasonId: 'season-1',
        pointsChange: 0,
        reason: 'MATCH_LOSS',
      }),
    });
  });

  it('awards guest XP for 1vAI without creating competitive ranking events', async () => {
    const match = {
      id: 'match-ai',
      mode: MatchMode.ONE_V_AI,
      status: MatchStatus.COMPLETED,
      completedAt,
      result: { winnerParticipantId: 'ai-participant' },
      participants: [
        participant('guest-participant', null, 'guest-1', ParticipantStatus.COMPLETED, [
          answer(JudgeDecision.CORRECT),
        ]),
        participant('ai-participant', null, null, ParticipantStatus.COMPLETED, [], ParticipantType.AI),
      ],
    };
    const tx = transaction(match);
    const service = new MatchSettlementService();

    await service.settleCompletedMatch(tx, 'match-ai');

    expect(tx.guestXPTransaction.create).toHaveBeenCalledWith({
      data: {
        guestIdentityId: 'guest-1',
        matchId: 'match-ai',
        amount: 12,
        reason: 'MATCH_REWARD',
        idempotencyKey: 'match:match-ai:guest:guest-1:xp:v1',
      },
    });
    expect(tx.guestProgress.create).toHaveBeenCalledWith({
      data: {
        guestIdentityId: 'guest-1',
        totalXp: BigInt(12),
        level: 1,
        currentLevelXp: 12,
      },
    });
    expect(tx.rankingTransaction.create).not.toHaveBeenCalled();
    expect(tx.rankingSeason.findMany).not.toHaveBeenCalled();
  });

  it('routes a converted guest participant to the registered user XP ledger', async () => {
    const match = {
      id: 'match-converted',
      mode: MatchMode.ONE_V_AI,
      status: MatchStatus.COMPLETED,
      completedAt,
      result: { winnerParticipantId: 'human-participant' },
      participants: [
        participant('human-participant', null, 'guest-1', ParticipantStatus.COMPLETED, [
          answer(JudgeDecision.INCORRECT),
        ]),
        participant('ai-participant', null, null, ParticipantStatus.COMPLETED, [], ParticipantType.AI),
      ],
    };
    const tx = transaction(match);
    tx.guestIdentity.findUnique.mockResolvedValue({ id: 'guest-1', convertedToUserId: 'user-1' });
    const service = new MatchSettlementService();

    await service.settleCompletedMatch(tx, 'match-converted');

    expect(tx.xPTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        matchId: 'match-converted',
        amount: 16,
        reason: 'MATCH_REWARD',
        idempotencyKey: 'match:match-converted:user:user-1:xp:v1',
      },
    });
    expect(tx.guestXPTransaction.create).not.toHaveBeenCalled();
    expect(tx.guestProgress.create).not.toHaveBeenCalled();
  });


  it('blocks progression and competitive ranking for a self-match created by guest conversion', async () => {
    const match = {
      id: 'self-match',
      mode: MatchMode.ONE_V_ONE,
      status: MatchStatus.COMPLETED,
      completedAt,
      result: { winnerParticipantId: 'registered-side' },
      participants: [
        participant('registered-side', 'user-1', null, ParticipantStatus.COMPLETED, [
          answer(JudgeDecision.CORRECT),
        ]),
        participant('converted-guest-side', null, 'guest-1', ParticipantStatus.COMPLETED, [
          answer(JudgeDecision.CORRECT),
        ]),
      ],
    };
    const tx = transaction(match);
    tx.guestIdentity.findUnique.mockResolvedValue({
      id: 'guest-1',
      convertedToUserId: 'user-1',
    });
    const service = new MatchSettlementService();

    await service.settleCompletedMatch(tx, 'self-match');

    expect(tx.xPTransaction.create).not.toHaveBeenCalled();
    expect(tx.guestXPTransaction.create).not.toHaveBeenCalled();
    expect(tx.rankingTransaction.create).not.toHaveBeenCalled();
  });

  it('rejects settlement without an authoritative completed result', async () => {
    const tx = transaction({
      id: 'unfinished',
      mode: MatchMode.ONE_V_ONE,
      status: MatchStatus.ACTIVE,
      completedAt: null,
      result: null,
      participants: [],
    });
    const service = new MatchSettlementService();

    await expect(service.settleCompletedMatch(tx, 'unfinished')).rejects.toThrow(
      'Cannot settle a match without an authoritative completed result',
    );
  });
});
