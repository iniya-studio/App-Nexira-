import { PrismaService } from '../../prisma/prisma.service';
import { PrincipalType, QuickBattleStatus } from '@prisma/client';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { QuickBattleService } from './quick-battle.service';

describe('QuickBattleService', () => {
  const guest: AuthenticatedPrincipal = {
    principalType: PrincipalType.GUEST,
    principalId: 'guest-1',
    sessionId: 'session-1',
  };

  function setup(existing: { id: string } | null = null) {
    let roundIndex = 0;
    const snapshot = {
      id: 'quick-battle-1',
      status: QuickBattleStatus.PREPARING,
      language: 'fa',
      roundsTarget: 10,
      currentRound: 0,
      generationPolicyVersion: 'quick-battle-generation-v1',
      scoringPolicyVersion: 'quick-battle-scoring-pending',
      startedAt: null,
      completedAt: null,
      voidedAt: null,
      voidReason: null,
      createdAt: new Date('2026-11-26T00:00:00.000Z'),
      rounds: [],
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      quickBattleMatch: {
        findFirst: jest.fn().mockResolvedValueOnce(existing).mockResolvedValue(snapshot),
        create: jest.fn().mockResolvedValue({ id: 'quick-battle-1' }),
      },
      quickBattleRound: {
        create: jest.fn().mockImplementation(async () => ({ id: `round-${++roundIndex}` })),
      },
      quickBattleQuestionJob: {
        create: jest.fn().mockResolvedValue({ id: 'job-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      quickBattleMatch: tx.quickBattleMatch,
    } as unknown as PrismaService;
    return { service: new QuickBattleService(prisma), tx };
  }

  it('creates an independent ten-round aggregate and one generation job per round', async () => {
    const { service, tx } = setup();
    const result = await service.createOrRecover(guest, 'fa');

    expect(result).toMatchObject({
      id: 'quick-battle-1',
      status: QuickBattleStatus.PREPARING,
      roundsTarget: 10,
      language: 'fa',
    });
    expect(tx.quickBattleRound.create).toHaveBeenCalledTimes(10);
    expect(tx.quickBattleQuestionJob.create).toHaveBeenCalledTimes(10);

    const rounds = tx.quickBattleRound.create.mock.calls.map(([input]) => input.data);
    expect(new Set(rounds.map((round) => round.category)).size).toBe(10);
    expect(rounds.every((round) => typeof round.subcategoryId === 'string')).toBe(true);
    expect(rounds.filter((round) => round.difficulty === 'EASY')).toHaveLength(3);
    expect(rounds.filter((round) => round.difficulty === 'MEDIUM')).toHaveLength(4);
    expect(rounds.filter((round) => round.difficulty === 'HARD')).toHaveLength(3);

    expect(tx.quickBattleQuestionJob.create.mock.calls[0][0].data).toMatchObject({
      matchId: 'quick-battle-1',
      requestContext: expect.objectContaining({
        subcategoryId: expect.any(String),
        language: 'fa',
        requiredLocales: ['fa'],
        answerType: 'FREE_TEXT',
      }),
      idempotencyKey: 'quick-battle:quick-battle-1:round:1:question:v1',
    });
  });

  it('returns the active Quick Battle instead of creating a duplicate', async () => {
    const { service, tx } = setup({ id: 'existing-match' });
    await service.createOrRecover(guest, 'fa');
    expect(tx.quickBattleMatch.create).not.toHaveBeenCalled();
    expect(tx.quickBattleRound.create).not.toHaveBeenCalled();
    expect(tx.quickBattleQuestionJob.create).not.toHaveBeenCalled();
  });

  it('uses the registered profile locale as the authoritative language snapshot', async () => {
    const { service, tx } = setup();
    tx.user.findUnique.mockResolvedValue({ preferredLanguage: 'en' });
    await service.createOrRecover({
      principalType: PrincipalType.USER,
      principalId: 'user-1',
      sessionId: 'session-1',
    }, 'fa');
    expect(tx.quickBattleMatch.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'user-1', language: 'en' }),
    }));
  });
});
