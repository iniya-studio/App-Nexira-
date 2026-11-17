import { ConfigService } from '@nestjs/config';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GuestIdentityStatus, PrincipalType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { MatchService } from '../match/match.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { EmailVerificationService } from '../auth/email-verification.service';
import { SessionService } from '../session/session.service';
import { GuestIdentityService } from './guest-identity.service';

describe('Guest conversion during an active public 1v1 match integration', () => {
  const prisma = new PrismaService();
  const matches = new MatchService(prisma);
  const matchmaking = new MatchmakingService(prisma, matches, {
    notifyMatchFound: jest.fn().mockResolvedValue(undefined),
  } as never);
  const matchIds: string[] = [];
  const queueIds: string[] = [];
  const guestIds: string[] = [];
  const userIds: string[] = [];
  const sessionIds: string[] = [];
  const questionIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (queueIds.length) {
      await prisma.matchmakingEntry.deleteMany({ where: { id: { in: queueIds } } });
      queueIds.length = 0;
    }
    if (matchIds.length) {
      const jobs = await prisma.questionGenerationJob.findMany({
        where: { matchId: { in: matchIds } },
        select: { generatedQuestionId: true },
      });
      questionIds.push(...jobs.map((job) => job.generatedQuestionId)
        .filter((id): id is string => id !== null));
      await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
      matchIds.length = 0;
    }
    if (questionIds.length) {
      await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
      questionIds.length = 0;
    }
    if (sessionIds.length) {
      await prisma.userSession.deleteMany({ where: { id: { in: sessionIds } } });
      sessionIds.length = 0;
    }
    if (guestIds.length) {
      await prisma.guestXPTransaction.deleteMany({ where: { guestIdentityId: { in: guestIds } } });
      await prisma.guestIdentity.deleteMany({ where: { id: { in: guestIds } } });
      guestIds.length = 0;
    }
    if (userIds.length) {
      await prisma.xPTransaction.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.rankingTransaction.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('transfers the guest queue and active match participant to the new account without interrupting the match', async () => {
    const [firstGuest, secondGuest] = await Promise.all([
      prisma.guestIdentity.create({ data: { displayName: 'Guest One' } }),
      prisma.guestIdentity.create({ data: { displayName: 'Guest Two' } }),
    ]);
    guestIds.push(firstGuest.id, secondGuest.id);

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const [firstSession, secondSession] = await Promise.all([
      prisma.userSession.create({ data: { guestIdentityId: firstGuest.id, expiresAt } }),
      prisma.userSession.create({ data: { guestIdentityId: secondGuest.id, expiresAt } }),
    ]);
    sessionIds.push(firstSession.id, secondSession.id);

    const firstPrincipal: AuthenticatedPrincipal = {
      principalType: PrincipalType.GUEST,
      principalId: firstGuest.id,
      sessionId: firstSession.id,
    };
    const secondPrincipal: AuthenticatedPrincipal = {
      principalType: PrincipalType.GUEST,
      principalId: secondGuest.id,
      sessionId: secondSession.id,
    };

    const firstQueue = await matchmaking.enqueue(firstPrincipal, {
      category: 'general',
      language: 'en',
      idempotencyKey: `guest-convert-${randomUUID()}`,
    });
    queueIds.push(firstQueue.queueId);
    expect(firstQueue.status).toBe('WAITING');

    const secondQueue = await matchmaking.enqueue(secondPrincipal, {
      category: 'general',
      language: 'en',
      idempotencyKey: `guest-convert-${randomUUID()}`,
    });
    queueIds.push(secondQueue.queueId);
    expect(secondQueue.status).toBe('MATCHED');
    expect(secondQueue.matchId).toBeTruthy();
    const matchId = secondQueue.matchId!;
    matchIds.push(matchId);

    const configValues: Record<string, string> = {
      ARGON2_MEMORY_COST_KIB: '1024',
      ARGON2_TIME_COST: '2',
      ARGON2_PARALLELISM: '1',
    };
    const config = {
      get: jest.fn((key: string, fallback?: string) => configValues[key] ?? fallback),
    };
    const sessions = {
      createSessionInTransaction: jest.fn(async (
        tx: Prisma.TransactionClient,
        owner: { principalType: PrincipalType; principalId: string },
      ) => {
        const userSessionExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
        const session = await tx.userSession.create({
          data: { userId: owner.principalId, expiresAt: userSessionExpiresAt },
        });
        sessionIds.push(session.id);
        return {
          principal: owner,
          session: { sessionId: session.id, expiresAt: userSessionExpiresAt.toISOString() },
          tokens: {
            accessToken: 'integration-access-token',
            accessTokenExpiresAt: userSessionExpiresAt.toISOString(),
            refreshToken: 'integration-refresh-token',
            refreshTokenExpiresAt: userSessionExpiresAt.toISOString(),
          },
        };
      }),
    };
    const emailVerification = { issueAndSend: jest.fn().mockResolvedValue('SENT') };
    const conversion = new GuestIdentityService(
      prisma,
      sessions as unknown as SessionService,
      config as unknown as ConfigService,
      emailVerification as unknown as EmailVerificationService,
    );

    const converted = await conversion.convert(firstPrincipal, {
      email: `guest-${randomUUID()}@example.test`,
      password: 'integration-password-123',
      username: `guest_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      displayName: 'Guest One Converted',
    });
    userIds.push(converted.user.id);
    const convertedPrincipal: AuthenticatedPrincipal = {
      principalType: PrincipalType.USER,
      principalId: converted.user.id,
      sessionId: converted.session.sessionId,
    };

    expect(converted.principal).toMatchObject({
      principalType: PrincipalType.USER,
      principalId: converted.user.id,
    });
    expect(converted.emailVerification).toMatchObject({ required: true, verified: false, delivery: 'SENT' });
    expect(emailVerification.issueAndSend).toHaveBeenCalledWith(converted.user.id);

    const guestState = await prisma.guestIdentity.findUniqueOrThrow({
      where: { id: firstGuest.id },
    });
    expect(guestState).toMatchObject({
      status: GuestIdentityStatus.CONVERTED,
      convertedToUserId: converted.user.id,
    });
    const revokedGuestSession = await prisma.userSession.findUniqueOrThrow({
      where: { id: firstSession.id },
    });
    expect(revokedGuestSession.revokedAt).toBeInstanceOf(Date);

    const participants = await prisma.matchParticipant.findMany({
      where: { matchId },
      orderBy: { joinedAt: 'asc' },
    });
    expect(participants).toHaveLength(2);
    expect(participants[0]).toMatchObject({
      userId: converted.user.id,
      guestIdentityId: null,
      status: 'ACTIVE',
    });
    expect(participants[1]).toMatchObject({
      userId: null,
      guestIdentityId: secondGuest.id,
      status: 'ACTIVE',
    });

    const queueEntries = await prisma.matchmakingEntry.findMany({
      where: { id: { in: [firstQueue.queueId, secondQueue.queueId] } },
    });
    expect(queueEntries).toHaveLength(2);
    expect(queueEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: converted.user.id,
        guestIdentityId: null,
        status: 'MATCHED',
        matchId,
      }),
      expect.objectContaining({
        userId: null,
        guestIdentityId: secondGuest.id,
        status: 'MATCHED',
        matchId,
      }),
    ]));

    const [convertedRecovery, opponentRecovery] = await Promise.all([
      matchmaking.getMine(convertedPrincipal),
      matchmaking.getMine(secondPrincipal),
    ]);
    expect(convertedRecovery).toMatchObject({
      status: 'MATCHED',
      matchId,
      match: { id: matchId, status: 'WAITING' },
    });
    expect(opponentRecovery).toMatchObject({
      status: 'MATCHED',
      matchId,
      match: { id: matchId, status: 'WAITING' },
    });

    const [convertedMatch, opponentMatch] = await Promise.all([
      matches.getMatch(matchId, convertedPrincipal),
      matches.getMatch(matchId, secondPrincipal),
    ]);
    expect(convertedMatch.participants.filter((participant) => participant.isSelf)).toHaveLength(1);
    expect(opponentMatch.participants.filter((participant) => participant.isSelf)).toHaveLength(1);
    await expect(matches.getMatch(matchId, firstPrincipal)).rejects.toBeInstanceOf(NotFoundException);
    await expect(matchmaking.getMine(firstPrincipal)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
