import { MatchMode, MatchStatus, ParticipantType, PrincipalType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { MatchService } from './match.service';

describe('MatchService', () => {
  const createdAt = new Date('2026-11-08T00:00:00.000Z');
  const principalCases: Array<[
    PrincipalType,
    { userId?: string; guestIdentityId?: string },
    string,
  ]> = [
    [PrincipalType.USER, { userId: 'user-1' }, 'user-1'],
    [PrincipalType.GUEST, { guestIdentityId: 'guest-1' }, 'guest-1'],
  ];

  it.each(principalCases)('creates a waiting 1vAI match for a %s principal', async (principalType, ownerData, principalId) => {
    const matchRecord = {
      id: 'match-1',
      mode: MatchMode.ONE_V_AI,
      status: MatchStatus.WAITING,
      currentRound: 0,
      createdAt,
      participants: [
        { participantType: ParticipantType.HUMAN, status: 'ACTIVE' },
        { participantType: ParticipantType.AI, status: 'ACTIVE' },
      ],
    };
    const prisma = {
      match: { create: jest.fn().mockResolvedValue(matchRecord) },
    } as unknown as PrismaService;
    const service = new MatchService(prisma);
    const principal: AuthenticatedPrincipal = {
      principalType,
      principalId,
      sessionId: 'session-1',
    };

    await expect(service.createAiMatch(principal)).resolves.toMatchObject({
      id: 'match-1',
      mode: MatchMode.ONE_V_AI,
      status: MatchStatus.WAITING,
      currentRound: 0,
      participants: [{ type: ParticipantType.HUMAN }, { type: ParticipantType.AI }],
    });

    expect(prisma.match.create).toHaveBeenCalledWith({
      data: {
        mode: MatchMode.ONE_V_AI,
        status: MatchStatus.WAITING,
        participants: {
          create: [
            {
              participantKey: `human:${principalType.toLowerCase()}:${principal.principalId}`,
              participantType: ParticipantType.HUMAN,
              ...ownerData,
            },
            { participantKey: 'ai:default-v1', participantType: ParticipantType.AI },
          ],
        },
      },
      select: {
        id: true,
        mode: true,
        status: true,
        currentRound: true,
        createdAt: true,
        participants: { select: { participantType: true, status: true } },
      },
    });
  });

  it('returns match state only to a participant and never includes interim scores', async () => {
    const prisma = {
      match: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'match-2',
          mode: MatchMode.ONE_V_ONE,
          status: MatchStatus.ACTIVE,
          currentRound: 1,
          createdAt,
          startedAt: createdAt,
          completedAt: null,
          participants: [
            { participantType: ParticipantType.HUMAN, status: 'ACTIVE' },
            { participantType: ParticipantType.HUMAN, status: 'ACTIVE' },
          ],
        }),
      },
    } as unknown as PrismaService;
    const service = new MatchService(prisma);
    const principal: AuthenticatedPrincipal = {
      principalType: PrincipalType.GUEST,
      principalId: 'guest-2',
      sessionId: 'session-2',
    };

    const result = await service.getMatch('match-2', principal);

    expect(prisma.match.findFirst).toHaveBeenCalledWith({
      where: { id: 'match-2', participants: { some: { guestIdentityId: 'guest-2' } } },
      select: {
        id: true,
        mode: true,
        status: true,
        currentRound: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        participants: { select: { participantType: true, status: true } },
      },
    });
    expect(result).not.toHaveProperty('score');
    expect(result.participants[0]).not.toHaveProperty('score');
  });

  it('does not reveal whether a non-participant match exists', async () => {
    const prisma = {
      match: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new MatchService(prisma);

    await expect(
      service.getMatch('match-private', {
        principalType: PrincipalType.USER,
        principalId: 'other-user',
        sessionId: 'session-3',
      }),
    ).rejects.toThrow('Match not found');
  });
});
