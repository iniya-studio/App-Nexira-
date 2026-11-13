import { MatchMode, MatchStatus, ParticipantType, PrincipalType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { MatchService } from './match.service';

describe('MatchService', () => {
  const createdAt = new Date('2026-11-08T00:00:00.000Z');

  function setup(mode: MatchMode, participants: Array<{ participantKey: string; participantType: ParticipantType; status: string }>) {
    const matchRecord = { id: 'match-1', mode, status: MatchStatus.WAITING, currentRound: 0, createdAt, participants };
    const tx = {
      user: { findUnique: jest.fn().mockResolvedValue({ preferredLanguage: 'fa' }) },
      match: {
        create: jest.fn().mockResolvedValue(matchRecord),
        findUnique: jest.fn().mockResolvedValue({ participants: participants.map((p) => ({ participantKey: p.participantKey })) }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      questionGenerationJob: { create: jest.fn().mockResolvedValue({}) },
      round: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
      match: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    return { service: new MatchService(prisma), prisma, tx };
  }

  it.each([[PrincipalType.USER, 'user-1'], [PrincipalType.GUEST, 'guest-1']] as const)(
    'creates a waiting 1vAI match and queues its initial question for %s',
    async (principalType, principalId) => {
      const { service, prisma, tx } = setup(MatchMode.ONE_V_AI, [
        { participantKey: `human:${principalType.toLowerCase()}:${principalId}`, participantType: ParticipantType.HUMAN, status: 'ACTIVE' },
        { participantKey: 'ai:default-v1', participantType: ParticipantType.AI, status: 'ACTIVE' },
      ]);
      const principal: AuthenticatedPrincipal = { principalType, principalId, sessionId: 'session-1' };
      await expect(service.createAiMatch(principal)).resolves.toMatchObject({
        id: 'match-1', mode: MatchMode.ONE_V_AI, status: MatchStatus.WAITING, currentRound: 0,
        participants: [{ type: ParticipantType.HUMAN }, { type: ParticipantType.AI }],
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.round.findMany).toHaveBeenCalledTimes(1);
      expect(tx.questionGenerationJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          matchId: 'match-1', sourceRoundId: null, triggerReason: 'INITIAL_MATCH',
          idempotencyKey: 'match:match-1:initial-question:v1', maxAttempts: 3,
          requestContext: expect.objectContaining({
            category: 'general', difficulty: 'medium',
            language: principalType === PrincipalType.USER ? 'fa' : 'en',
            answerType: 'FREE_TEXT', timeLimitSeconds: 30,
          }),
        }),
      });
    },
  );

  it('creates a 1v1 match and queues one shared initial question', async () => {
    const { service, tx } = setup(MatchMode.ONE_V_ONE, [
      { participantKey: 'human:user:user-1', participantType: ParticipantType.HUMAN, status: 'ACTIVE' },
      { participantKey: 'human:guest:guest-2', participantType: ParticipantType.HUMAN, status: 'ACTIVE' },
    ]);
    await expect(service.createOneVsOne(
      { principalType: PrincipalType.USER, principalId: 'user-1', sessionId: 'session-1' },
      { principalType: PrincipalType.GUEST, principalId: 'guest-2', sessionId: 'session-2' },
    )).resolves.toMatchObject({ mode: MatchMode.ONE_V_ONE, status: MatchStatus.WAITING });
    expect(tx.questionGenerationJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceRoundId: null, triggerReason: 'INITIAL_MATCH',
        requestContext: expect.objectContaining({ language: 'fa' }),
      }),
    });
  });


  it('creates 1v1 match and initial question inside the caller transaction', async () => {
    const { service, prisma, tx } = setup(MatchMode.ONE_V_ONE, [
      { participantKey: 'human:user:user-1', participantType: ParticipantType.HUMAN, status: 'ACTIVE' },
      { participantKey: 'human:guest:guest-2', participantType: ParticipantType.HUMAN, status: 'ACTIVE' },
    ]);
    await service.createOneVsOne(
      { principalType: PrincipalType.USER, principalId: 'user-1', sessionId: 'session-1' },
      { principalType: PrincipalType.GUEST, principalId: 'guest-2', sessionId: 'session-2' },
      tx as unknown as Prisma.TransactionClient,
      { category: 'math', language: 'fa' },
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.match.create).toHaveBeenCalledTimes(1);
    expect(tx.questionGenerationJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        matchId: 'match-1',
        requestContext: expect.objectContaining({ category: 'math', language: 'fa' }),
      }),
    });
  });

  it('rejects matching a principal against itself before creating a match', async () => {
    const { service, prisma } = setup(MatchMode.ONE_V_ONE, []);
    const principal = { principalType: PrincipalType.USER, principalId: 'same-user', sessionId: 'session-1' };
    await expect(service.createOneVsOne(principal, principal)).rejects.toThrow(
      'A participant cannot be matched against themselves',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts the selected category and language for a real 1vAI match', async () => {
    const { service, tx } = setup(MatchMode.ONE_V_AI, [
      { participantKey: 'human:guest:guest-1', participantType: ParticipantType.HUMAN, status: 'ACTIVE' },
      { participantKey: 'ai:default-v1', participantType: ParticipantType.AI, status: 'ACTIVE' },
    ]);
    await service.createAiMatch(
      { principalType: PrincipalType.GUEST, principalId: 'guest-1', sessionId: 'session-1' },
      { category: 'science', language: 'fa' },
    );
    expect(tx.questionGenerationJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestContext: expect.objectContaining({
          category: 'science', language: 'fa', answerType: 'FREE_TEXT',
        }),
      }),
    });
  });

  it('returns a participant-authorized final result without exposing participant IDs', async () => {
    const prisma = {
      match: { findFirst: jest.fn().mockResolvedValue({
        id: 'match-result-1',
        mode: MatchMode.ONE_V_AI,
        status: MatchStatus.COMPLETED,
        roundsTarget: 10,
        currentRound: 10,
        completedAt: createdAt,
        participants: [
          { id: 'human-row', userId: null, guestIdentityId: 'guest-1', participantType: ParticipantType.HUMAN, status: 'COMPLETED', score: 120 },
          { id: 'ai-row', userId: null, guestIdentityId: null, participantType: ParticipantType.AI, status: 'COMPLETED', score: 90 },
        ],
        result: { winnerParticipantId: 'human-row', resultSummary: { outcome: 'SCORE_WIN' } },
      }) },
    } as unknown as PrismaService;
    const service = new MatchService(prisma);
    const result = await service.getMatchResult('match-result-1', {
      principalType: PrincipalType.GUEST, principalId: 'guest-1', sessionId: 'session-1',
    });
    expect(result).toMatchObject({
      completed: true, outcome: 'SCORE_WIN', winnerType: ParticipantType.HUMAN, youWon: true,
      participants: [
        { type: ParticipantType.HUMAN, score: 120, isSelf: true },
        { type: ParticipantType.AI, score: 90, isSelf: false },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('human-row');
    expect(JSON.stringify(result)).not.toContain('guest-1');
  });

  it('does not expose interim scores through the result endpoint', async () => {
    const prisma = {
      match: { findFirst: jest.fn().mockResolvedValue({
        id: 'match-pending-result',
        mode: MatchMode.ONE_V_AI,
        status: MatchStatus.ACTIVE,
        roundsTarget: 10,
        currentRound: 1,
        completedAt: null,
        participants: [
          { id: 'human-row', userId: null, guestIdentityId: 'guest-1', participantType: ParticipantType.HUMAN, status: 'ACTIVE', score: 50 },
          { id: 'ai-row', userId: null, guestIdentityId: null, participantType: ParticipantType.AI, status: 'ACTIVE', score: 80 },
        ],
        result: null,
      }) },
    } as unknown as PrismaService;
    const service = new MatchService(prisma);
    const result = await service.getMatchResult('match-pending-result', {
      principalType: PrincipalType.GUEST, principalId: 'guest-1', sessionId: 'session-1',
    });
    expect(result.completed).toBe(false);
    expect(result.participants[0]).not.toHaveProperty('score');
    expect(result.participants[1]).not.toHaveProperty('score');
    expect(result.winnerType).toBeNull();
  });

  it('returns match state only to a participant and never includes interim scores', async () => {
    const prisma = { match: { findFirst: jest.fn().mockResolvedValue({
      id: 'match-2', mode: MatchMode.ONE_V_ONE, status: MatchStatus.ACTIVE,
      currentRound: 1, createdAt, startedAt: createdAt, completedAt: null,
      participants: [
        { participantType: ParticipantType.HUMAN, status: 'ACTIVE' },
        { participantType: ParticipantType.HUMAN, status: 'ACTIVE' },
      ],
    }) } } as unknown as PrismaService;
    const service = new MatchService(prisma);
    const result = await service.getMatch('match-2', {
      principalType: PrincipalType.GUEST, principalId: 'guest-2', sessionId: 'session-2',
    });
    expect(result).not.toHaveProperty('score');
    expect(result.participants[0]).not.toHaveProperty('score');
  });

  it('does not reveal whether a non-participant match exists', async () => {
    const prisma = { match: { findFirst: jest.fn().mockResolvedValue(null) } } as unknown as PrismaService;
    const service = new MatchService(prisma);
    await expect(service.getMatch('match-private', {
      principalType: PrincipalType.USER, principalId: 'other-user', sessionId: 'session-3',
    })).rejects.toThrow('Match not found');
  });
});
