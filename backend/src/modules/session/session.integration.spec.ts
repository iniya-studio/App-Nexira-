import { ConfigService } from '@nestjs/config';
import {
  AnswerStatus,
  GuestIdentityStatus,
  JudgeDecision,
  JudgeStatus,
  MatchMode,
  MatchStatus,
  ParticipantStatus,
  ParticipantType,
  PrincipalType,
} from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenGuard } from '../identity/access-token.guard';
import { AccessTokenService } from '../identity/access-token.service';
import { GuestIdentityService } from '../guest-identity/guest-identity.service';
import { MatchSettlementService } from '../match/match-settlement.service';
import { SessionService } from './session.service';

describe('Guest identity and session integration', () => {
  const values: Record<string, string> = {
    JWT_SECRET: Buffer.alloc(32, 11).toString('base64'),
    JWT_ISSUER: 'https://integration.nexira.test',
    JWT_AUDIENCE: 'nexira-integration',
    ACCESS_TOKEN_TTL_SECONDS: '900',
    SESSION_ABSOLUTE_TTL_SECONDS: '3600',
    REFRESH_TOKEN_TTL_SECONDS: '1800',
    REFRESH_RETRY_WINDOW_SECONDS: '60',
    REFRESH_RETRY_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString('base64'),
    GUEST_CONVERSION_REPLAY_ENCRYPTION_KEY: Buffer.alloc(32, 23).toString('base64'),
    GUEST_CONVERSION_REPLAY_WINDOW_SECONDS: '300',
    GUEST_CONVERSION_IP_MAX_ATTEMPTS: '100',
    GUEST_CONVERSION_RETRY_MAX_ATTEMPTS: '100',
    GUEST_CONVERSION_RETRY_IP_MAX_ATTEMPTS: '100',
    GUEST_START_MAX_ATTEMPTS: '20',
    GUEST_START_WINDOW_SECONDS: '60',
    GUEST_CONVERSION_MAX_ATTEMPTS: '20',
    GUEST_CONVERSION_WINDOW_SECONDS: '3600',
    ARGON2_MEMORY_COST_KIB: '1024',
    ARGON2_TIME_COST: '2',
    ARGON2_PARALLELISM: '1',
  };
  const config = {
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing test config: ${key}`);
      return value;
    },
    get: (key: string, fallback: string) => values[key] ?? fallback,
  } as unknown as ConfigService;

  const prisma = new PrismaService();
  const accessTokens = new AccessTokenService(config);
  const sessions = new SessionService(prisma, config, accessTokens);
  const emailVerification = { issueAndSend: async () => 'SENT' };
  const guests = new GuestIdentityService(prisma, sessions, config, emailVerification as never);
  const accessGuard = new AccessTokenGuard(accessTokens, prisma);
  const settlement = new MatchSettlementService();
  const matchIds: string[] = [];
  const questionIds: string[] = [];
  const guestIds: string[] = [];
  const convertedUserIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (matchIds.length) {
      await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
      matchIds.length = 0;
    }
    if (questionIds.length) {
      await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
      questionIds.length = 0;
    }
    if (guestIds.length) {
      await prisma.userSession.deleteMany({ where: { guestIdentityId: { in: guestIds } } });
      await prisma.identityAuditEvent.deleteMany({ where: { principalId: { in: guestIds } } });
      await prisma.guestXPTransaction.deleteMany({ where: { guestIdentityId: { in: guestIds } } });
      await prisma.guestIdentity.deleteMany({ where: { id: { in: guestIds } } });
      guestIds.length = 0;
    }
    if (convertedUserIds.length) {
      await prisma.identityAuditEvent.deleteMany({ where: { principalId: { in: convertedUserIds } } });
      await prisma.xPTransaction.deleteMany({ where: { userId: { in: convertedUserIds } } });
      await prisma.rankingTransaction.deleteMany({ where: { userId: { in: convertedUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: convertedUserIds } } });
      convertedUserIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function startGuest() {
    const result = await guests.start(`integration-${randomUUID()}`);
    guestIds.push(result.principal.principalId);
    return result;
  }

  it('creates a guest session, rotates refresh credentials, and returns the same response for a safe retry', async () => {
    const started = await startGuest();
    expect(started.principal.principalType).toBe(PrincipalType.GUEST);
    const principal = await accessGuard.authenticate(started.tokens.accessToken);
    expect(principal).toEqual({
      principalType: PrincipalType.GUEST,
      principalId: started.principal.principalId,
      sessionId: started.session.sessionId,
    });

    const idempotencyKey = randomBytes(32).toString('base64url');
    const rotated = await sessions.refresh(started.tokens.refreshToken, idempotencyKey);
    const retried = await sessions.refresh(started.tokens.refreshToken, idempotencyKey);
    expect(retried).toEqual(rotated);
    expect(rotated.tokens.refreshToken).not.toBe(started.tokens.refreshToken);

    await expect(
      sessions.refresh(started.tokens.refreshToken, randomBytes(32).toString('base64url')),
    ).rejects.toThrow('Refresh token reuse detected');
    const revoked = await prisma.userSession.findUnique({ where: { id: started.session.sessionId } });
    expect(revoked?.revokedAt).not.toBeNull();
  });

  it('rejects refresh and access after guest revocation or session logout', async () => {
    const started = await startGuest();
    await sessions.logout({
      principalType: PrincipalType.GUEST,
      principalId: started.principal.principalId,
      sessionId: started.session.sessionId,
    });
    await expect(accessGuard.authenticate(started.tokens.accessToken)).rejects.toThrow();
    await expect(
      sessions.refresh(started.tokens.refreshToken, randomBytes(32).toString('base64url')),
    ).rejects.toThrow();
  });

  it('does not convert a guest after the exact authenticated session has been revoked', async () => {
    const started = await startGuest();
    const principal = {
      principalType: PrincipalType.GUEST,
      principalId: started.principal.principalId,
      sessionId: started.session.sessionId,
    };
    await sessions.logout(principal);
    const email = `revoked-${randomUUID()}@example.test`;
    await expect(guests.convert(principal, {
      email,
      password: 'integration-test-password-strong',
      username: `revoked_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      displayName: 'Revoked Guest',
      refreshToken: started.tokens.refreshToken,
    }, randomBytes(32).toString('base64url'))).rejects.toThrow('Guest session is no longer active');
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it('serializes a concurrent guest logout and conversion without creating an account from a revoked session', async () => {
    const started = await startGuest();
    const guestId = started.principal.principalId;
    const sessionId = started.session.sessionId;
    const email = `logout-race-${randomUUID()}@example.test`;
    const principal = {
      principalType: PrincipalType.GUEST,
      principalId: guestId,
      sessionId,
    };

    const [conversion, logout] = await Promise.allSettled([
      guests.convert(principal, {
        email,
        password: 'integration-test-password-strong',
        username: `logout_race_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        displayName: 'Logout Race Guest',
        refreshToken: started.tokens.refreshToken,
      }, randomBytes(32).toString('base64url')),
      sessions.logout(principal),
    ]);

    expect(logout.status).toBe('fulfilled');
    const [guest, oldSession, createdUser] = await Promise.all([
      prisma.guestIdentity.findUniqueOrThrow({ where: { id: guestId } }),
      prisma.userSession.findUniqueOrThrow({ where: { id: sessionId } }),
      prisma.user.findUnique({ where: { email } }),
    ]);
    expect(oldSession.revokedAt).toBeInstanceOf(Date);

    if (conversion.status === 'fulfilled') {
      convertedUserIds.push(conversion.value.user.id);
      expect(guest).toMatchObject({
        status: GuestIdentityStatus.CONVERTED,
        convertedToUserId: conversion.value.user.id,
      });
      expect(createdUser?.id).toBe(conversion.value.user.id);
      expect(conversion.value.session.sessionId).not.toBe(sessionId);
    } else {
      expect(guest).toMatchObject({
        status: GuestIdentityStatus.ACTIVE,
        convertedToUserId: null,
      });
      expect(createdUser).toBeNull();
      const conversionError = conversion.reason as { getStatus?: () => number; code?: string };
      expect(conversionError.getStatus?.() === 401 || conversionError.code === 'P2034').toBe(true);
    }
  });

  it('rejects a guest whose identity is no longer active', async () => {
    const started = await startGuest();
    await prisma.guestIdentity.update({
      where: { id: started.principal.principalId },
      data: { status: GuestIdentityStatus.REVOKED },
    });
    await expect(accessGuard.authenticate(started.tokens.accessToken)).rejects.toThrow();
    await expect(
      sessions.refresh(started.tokens.refreshToken, randomBytes(32).toString('base64url')),
    ).rejects.toThrow('Session is not active');
  });
  it('converts an active guest in PostgreSQL, transfers Companion, revokes guest credentials, and issues a USER session', async () => {
    const started = await startGuest();
    const guestId = started.principal.principalId;
    const guestSessionId = started.session.sessionId;

    const companion = await prisma.companionProfile.create({
      data: { guestIdentityId: guestId },
    });
    await prisma.guestProgress.create({
      data: {
        guestIdentityId: guestId,
        level: 3,
        currentLevelXp: 25,
        totalXp: BigInt(325),
      },
    });
    await prisma.guestXPTransaction.createMany({
      data: [
        {
          guestIdentityId: guestId,
          amount: 100,
          reason: 'MATCH_REWARD',
          idempotencyKey: `guest-conversion-test:${guestId}:xp:1`,
        },
        {
          guestIdentityId: guestId,
          amount: 225,
          reason: 'MATCH_REWARD',
          idempotencyKey: `guest-conversion-test:${guestId}:xp:2`,
        },
      ],
    });

    const result = await guests.convert({
      principalType: PrincipalType.GUEST,
      principalId: guestId,
      sessionId: guestSessionId,
    }, {
      email: `conversion-${randomUUID()}@example.test`,
      password: 'integration-test-password-strong',
      username: `player_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      displayName: 'Integration Player',
      refreshToken: started.tokens.refreshToken,
    }, randomBytes(32).toString('base64url'));

    const userId = result.principal.principalId;
    convertedUserIds.push(userId);

    expect(result.principal.principalType).toBe(PrincipalType.USER);
    expect(await accessGuard.authenticate(result.tokens.accessToken)).toEqual({
      principalType: PrincipalType.USER,
      principalId: userId,
      sessionId: result.session.sessionId,
    });

    const [guest, transferredProfile, oldSession, newSession, oldRefreshTokens, audit, userProgress, transferredXp, guestProgress] = await Promise.all([
      prisma.guestIdentity.findUnique({ where: { id: guestId } }),
      prisma.companionProfile.findUnique({ where: { id: companion.id } }),
      prisma.userSession.findUnique({ where: { id: guestSessionId } }),
      prisma.userSession.findUnique({ where: { id: result.session.sessionId } }),
      prisma.refreshToken.findMany({ where: { sessionId: guestSessionId } }),
      prisma.identityAuditEvent.findFirst({
        where: { principalType: PrincipalType.GUEST, principalId: guestId, eventType: 'GUEST_IDENTITY_CONVERTED' },
      }),
      prisma.userProgress.findUnique({ where: { userId } }),
      prisma.xPTransaction.findMany({ where: { userId } }),
      prisma.guestProgress.findUnique({ where: { guestIdentityId: guestId } }),
    ]);

    expect(guest?.status).toBe(GuestIdentityStatus.CONVERTED);
    expect(guest?.convertedToUserId).toBe(userId);
    expect(guest?.convertedAt).toBeInstanceOf(Date);
    expect(transferredProfile).toMatchObject({
      id: companion.id,
      userId,
      guestIdentityId: null,
    });
    expect(oldSession?.revokedAt).toBeInstanceOf(Date);
    expect(newSession).toMatchObject({ userId, guestIdentityId: null, revokedAt: null });
    expect(oldRefreshTokens.length).toBeGreaterThan(0);
    expect(oldRefreshTokens.every((token) => token.revokedAt instanceof Date)).toBe(true);
    expect(audit).toBeTruthy();
    expect(userProgress).toMatchObject({
      userId,
      level: 3,
      currentLevelXp: 25,
      totalXp: BigInt(325),
    });
    expect(transferredXp).toHaveLength(2);
    expect(transferredXp.every((event) =>
      event.reason === 'GUEST_CONVERSION_TRANSFER' &&
      event.idempotencyKey.startsWith(`guest-conversion:${guestId}:xp:`),
    )).toBe(true);
    expect(guestProgress?.transferredAt).toBeInstanceOf(Date);

    await expect(accessGuard.authenticate(started.tokens.accessToken)).rejects.toThrow();
    await expect(
      sessions.refresh(started.tokens.refreshToken, randomBytes(32).toString('base64url')),
    ).rejects.toThrow();
    expect(result.emailVerification).toEqual({ required: true, verified: false });
  });

  it('serializes two real concurrent conversions of the same guest and transfers progression exactly once', async () => {
    const started = await startGuest();
    const guestId = started.principal.principalId;
    const guestSessionId = started.session.sessionId;
    const suffix = randomUUID();
    const emails = [
      `duplicate-conversion-a-${suffix}@example.test`,
      `duplicate-conversion-b-${suffix}@example.test`,
    ];
    const usernames = [
      `duplicate_a_${suffix.replace(/-/g, '').slice(0, 12)}`,
      `duplicate_b_${suffix.replace(/-/g, '').slice(0, 12)}`,
    ];

    const companion = await prisma.companionProfile.create({
      data: { guestIdentityId: guestId },
    });
    await prisma.guestProgress.create({
      data: {
        guestIdentityId: guestId,
        level: 1,
        currentLevelXp: 17,
        totalXp: BigInt(17),
      },
    });
    await prisma.guestXPTransaction.create({
      data: {
        guestIdentityId: guestId,
        amount: 17,
        reason: 'MATCH_REWARD',
        idempotencyKey: `duplicate-conversion:${guestId}:xp:v1`,
      },
    });

    const principal = {
      principalType: PrincipalType.GUEST,
      principalId: guestId,
      sessionId: guestSessionId,
    };
    const convert = (index: number) => guests.convert(principal, {
      email: emails[index],
      password: 'integration-test-password-strong',
      username: usernames[index],
      displayName: `Concurrent Conversion ${index}`,
      refreshToken: started.tokens.refreshToken,
    }, randomBytes(32).toString('base64url'));

    const outcomes = await Promise.allSettled([convert(0), convert(1)]);
    const successful = outcomes.find((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');

    expect(successful?.status).toBe('fulfilled');
    expect(rejected?.status).toBe('rejected');
    if (!successful || successful.status !== 'fulfilled') {
      throw new Error('Exactly one concurrent guest conversion must succeed');
    }
    if (rejected?.status === 'rejected') {
      expect(rejected.reason.getStatus?.()).toBe(401);
    }

    const convertedUserId = successful.value.principal.principalId;
    convertedUserIds.push(convertedUserId);

    const [guest, users, transferredProfile, oldSession, userSessions, userProgress, userXpEvents, guestProgress, guestXpEvents] = await Promise.all([
      prisma.guestIdentity.findUniqueOrThrow({ where: { id: guestId } }),
      prisma.user.findMany({ where: { email: { in: emails } } }),
      prisma.companionProfile.findUnique({ where: { id: companion.id } }),
      prisma.userSession.findUniqueOrThrow({ where: { id: guestSessionId } }),
      prisma.userSession.findMany({ where: { userId: convertedUserId } }),
      prisma.userProgress.findUnique({ where: { userId: convertedUserId } }),
      prisma.xPTransaction.findMany({ where: { userId: convertedUserId } }),
      prisma.guestProgress.findUnique({ where: { guestIdentityId: guestId } }),
      prisma.guestXPTransaction.findMany({ where: { guestIdentityId: guestId } }),
    ]);

    expect(guest).toMatchObject({
      status: GuestIdentityStatus.CONVERTED,
      convertedToUserId: convertedUserId,
    });
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(convertedUserId);
    expect(transferredProfile).toMatchObject({
      id: companion.id,
      userId: convertedUserId,
      guestIdentityId: null,
    });
    expect(oldSession.revokedAt).toBeInstanceOf(Date);
    expect(userSessions).toHaveLength(1);
    expect(userSessions[0]).toMatchObject({ userId: convertedUserId, revokedAt: null });
    expect(userProgress?.totalXp).toBe(BigInt(17));
    expect(userXpEvents).toHaveLength(1);
    expect(userXpEvents[0]).toMatchObject({
      amount: 17,
      reason: 'GUEST_CONVERSION_TRANSFER',
      idempotencyKey: `guest-conversion:${guestId}:xp:${guestXpEvents[0]?.id}:v1`,
    });
    expect(guestProgress?.transferredAt).toBeInstanceOf(Date);
    expect(guestXpEvents).toHaveLength(1);
  });

  it.each(['settlement-first', 'conversion-first'] as const)('preserves exactly-once XP when guest conversion runs %s relative to completed-match settlement', async (ordering) => {
    const started = await startGuest();
    const guestId = started.principal.principalId;
    const opponent = await prisma.user.create({
      data: { username: `settlement-opponent-${randomUUID()}`, displayName: 'Settlement Opponent' },
    });
    convertedUserIds.push(opponent.id);

    const matchCompletedAt = new Date();
    const match = await prisma.match.create({
      data: {
        mode: MatchMode.ONE_V_ONE,
        status: MatchStatus.COMPLETED,
        currentRound: 1,
        roundsTarget: 10,
        startedAt: new Date(matchCompletedAt.getTime() - 60_000),
        completedAt: matchCompletedAt,
      },
    });
    matchIds.push(match.id);

    const [guestParticipant, opponentParticipant] = await Promise.all([
      prisma.matchParticipant.create({
        data: {
          matchId: match.id,
          guestIdentityId: guestId,
          participantKey: `guest:${guestId}`,
          participantType: ParticipantType.HUMAN,
          status: ParticipantStatus.COMPLETED,
          score: 10,
          finishedAt: matchCompletedAt,
        },
      }),
      prisma.matchParticipant.create({
        data: {
          matchId: match.id,
          userId: opponent.id,
          participantKey: `user:${opponent.id}`,
          participantType: ParticipantType.HUMAN,
          status: ParticipantStatus.COMPLETED,
          score: 5,
          finishedAt: matchCompletedAt,
        },
      }),
    ]);
    const question = await prisma.question.create({
      data: {
        canonicalLanguage: 'en',
        answerType: 'FREE_TEXT',
        canonicalPrompt: 'Name the red planet.',
        answerKey: 'Mars',
        gradingRubric: { requiredConcepts: ['Mars'] },
        localized: { en: { prompt: 'Name the red planet.' } },
        timeLimitSeconds: 30,
        contentVersion: `guest-settlement-race-${randomUUID()}`,
      },
    });
    questionIds.push(question.id);
    const round = await prisma.round.create({
      data: {
        matchId: match.id,
        roundNumber: 1,
        questionId: question.id,
        startedAt: new Date(matchCompletedAt.getTime() - 30_000),
        deadlineAt: matchCompletedAt,
        completedAt: matchCompletedAt,
      },
    });
    await prisma.answer.createMany({
      data: [
        {
          matchId: match.id,
          roundId: round.id,
          participantId: guestParticipant.id,
          responseText: 'Mars',
          status: AnswerStatus.ANSWERED,
          judgeStatus: JudgeStatus.COMPLETED,
          decision: JudgeDecision.CORRECT,
          elapsedMs: 2_000,
          points: 10,
        },
        {
          matchId: match.id,
          roundId: round.id,
          participantId: opponentParticipant.id,
          responseText: 'Venus',
          status: AnswerStatus.ANSWERED,
          judgeStatus: JudgeStatus.COMPLETED,
          decision: JudgeDecision.INCORRECT,
          elapsedMs: 3_000,
          points: 0,
        },
      ],
    });
    await prisma.matchResult.create({
      data: {
        matchId: match.id,
        winnerParticipantId: guestParticipant.id,
        resultSummary: {
          outcome: 'SCORE_WIN',
          roundsPlayed: 1,
          winnerParticipantId: guestParticipant.id,
          finalScores: { [guestParticipant.id]: 10, [opponentParticipant.id]: 5 },
        },
        completedAt: matchCompletedAt,
      },
    });

    const convertGuest = () => guests.convert({
      principalType: PrincipalType.GUEST,
      principalId: guestId,
      sessionId: started.session.sessionId,
    }, {
      email: `settlement-order-${ordering}-${randomUUID()}@example.test`,
      password: 'integration-test-password-strong',
      username: `settlement_order_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      displayName: 'Converted Settlement Player',
      refreshToken: started.tokens.refreshToken,
    }, randomBytes(32).toString('base64url'));

    let conversion: Awaited<ReturnType<typeof guests.convert>>;
    if (ordering === 'settlement-first') {
      // First prove settlement writes the expected guest and opponent ledgers.
      await prisma.$transaction((tx) =>
        settlement.settleCompletedMatch(tx, match.id),
      );

      const [preConversionProgress, preConversionXp, preConversionOpponentProgress] = await Promise.all([
        prisma.guestProgress.findUnique({ where: { guestIdentityId: guestId } }),
        prisma.guestXPTransaction.findMany({ where: { guestIdentityId: guestId, matchId: match.id } }),
        prisma.userProgress.findUnique({ where: { userId: opponent.id } }),
      ]);
      expect(preConversionProgress?.totalXp).toBe(BigInt(17));
      expect(preConversionXp).toHaveLength(1);
      expect(preConversionXp[0]).toMatchObject({ amount: 17, reason: 'MATCH_REWARD' });
      expect(preConversionOpponentProgress?.totalXp).toBe(BigInt(11));
      conversion = await convertGuest();
    } else {
      // Conversion-first must still let settlement resolve the converted guest to the new user.
      conversion = await convertGuest();
      await prisma.$transaction((tx) =>
        settlement.settleCompletedMatch(tx, match.id),
      );
    }
    const userId = conversion.principal.principalId;
    convertedUserIds.push(userId);

    const [guest, guestProgress, userProgress, userXpEvents, guestXpEvents, opponentProgress] = await Promise.all([
      prisma.guestIdentity.findUniqueOrThrow({ where: { id: guestId } }),
      prisma.guestProgress.findUnique({ where: { guestIdentityId: guestId } }),
      prisma.userProgress.findUnique({ where: { userId } }),
      prisma.xPTransaction.findMany({ where: { userId, matchId: match.id } }),
      prisma.guestXPTransaction.findMany({ where: { guestIdentityId: guestId, matchId: match.id } }),
      prisma.userProgress.findUnique({ where: { userId: opponent.id } }),
    ]);

    expect(guest.status).toBe(GuestIdentityStatus.CONVERTED);
    expect(guest.convertedToUserId).toBe(userId);
    expect(userProgress?.totalXp).toBe(BigInt(17));
    expect(userXpEvents).toHaveLength(1);
    expect(userXpEvents[0]).toMatchObject({ amount: 17 });
    expect(['MATCH_REWARD', 'GUEST_CONVERSION_TRANSFER']).toContain(userXpEvents[0].reason);
    expect(guestXpEvents.length).toBeLessThanOrEqual(1);
    if (guestXpEvents.length === 1) {
      expect(guestXpEvents[0].amount).toBe(17);
      expect(guestProgress?.transferredAt).toBeInstanceOf(Date);
      expect(userXpEvents[0].reason).toBe('GUEST_CONVERSION_TRANSFER');
    } else {
      expect(guestProgress).toBeNull();
      expect(userXpEvents[0].reason).toBe('MATCH_REWARD');
    }
    expect(opponentProgress?.totalXp).toBe(BigInt(11));
  });

  it.each(['conversion-first', 'settlement-first'] as const)(
    'preserves XP when %s wins the real PostgreSQL GuestIdentity lock race',
    async (ordering) => {
      const started = await startGuest();
      const guestId = started.principal.principalId;
      const opponent = await prisma.user.create({
        data: { username: 'lock-race-opponent-' + randomUUID(), displayName: 'Lock Race Opponent' },
      });
      convertedUserIds.push(opponent.id);

      const completedAt = new Date();
      const match = await prisma.match.create({
        data: {
          mode: MatchMode.ONE_V_ONE,
          status: MatchStatus.COMPLETED,
          currentRound: 1,
          roundsTarget: 10,
          startedAt: new Date(completedAt.getTime() - 60_000),
          completedAt,
        },
      });
      matchIds.push(match.id);

      const [guestParticipant, opponentParticipant] = await Promise.all([
        prisma.matchParticipant.create({
          data: {
            matchId: match.id,
            guestIdentityId: guestId,
            participantKey: 'guest:' + guestId,
            participantType: ParticipantType.HUMAN,
            status: ParticipantStatus.COMPLETED,
            score: 10,
            finishedAt: completedAt,
          },
        }),
        prisma.matchParticipant.create({
          data: {
            matchId: match.id,
            userId: opponent.id,
            participantKey: 'user:' + opponent.id,
            participantType: ParticipantType.HUMAN,
            status: ParticipantStatus.COMPLETED,
            score: 5,
            finishedAt: completedAt,
          },
        }),
      ]);
      const question = await prisma.question.create({
        data: {
          canonicalLanguage: 'en',
          answerType: 'FREE_TEXT',
          canonicalPrompt: 'Name the red planet.',
          answerKey: 'Mars',
          gradingRubric: { requiredConcepts: ['Mars'] },
          localized: { en: { prompt: 'Name the red planet.' } },
          timeLimitSeconds: 30,
          contentVersion: 'guest-lock-race-' + randomUUID(),
        },
      });
      questionIds.push(question.id);
      const round = await prisma.round.create({
        data: {
          matchId: match.id,
          roundNumber: 1,
          questionId: question.id,
          startedAt: new Date(completedAt.getTime() - 30_000),
          deadlineAt: completedAt,
          completedAt,
        },
      });
      await prisma.answer.createMany({
        data: [
          {
            matchId: match.id,
            roundId: round.id,
            participantId: guestParticipant.id,
            responseText: 'Mars',
            status: AnswerStatus.ANSWERED,
            judgeStatus: JudgeStatus.COMPLETED,
            decision: JudgeDecision.CORRECT,
            elapsedMs: 2_000,
            points: 10,
          },
          {
            matchId: match.id,
            roundId: round.id,
            participantId: opponentParticipant.id,
            responseText: 'Venus',
            status: AnswerStatus.ANSWERED,
            judgeStatus: JudgeStatus.COMPLETED,
            decision: JudgeDecision.INCORRECT,
            elapsedMs: 3_000,
            points: 0,
          },
        ],
      });
      await prisma.matchResult.create({
        data: {
          matchId: match.id,
          winnerParticipantId: guestParticipant.id,
          resultSummary: {
            outcome: 'SCORE_WIN',
            roundsPlayed: 1,
            winnerParticipantId: guestParticipant.id,
            finalScores: { [guestParticipant.id]: 10, [opponentParticipant.id]: 5 },
          },
          completedAt,
        },
      });

      const convertGuest = () => guests.convert({
        principalType: PrincipalType.GUEST,
        principalId: guestId,
        sessionId: started.session.sessionId,
      }, {
        email: 'guest-lock-race-' + ordering + '-' + randomUUID() + '@example.test',
        password: 'integration-test-password-strong',
        username: 'guest_lock_race_' + randomUUID().replace(/-/g, '').slice(0, 12),
        displayName: 'Lock Race Converted Player',
        refreshToken: started.tokens.refreshToken,
      }, randomBytes(32).toString('base64url'));

      // Hold the actual row lock so both production transactions enter its
      // PostgreSQL wait queue in a known order before it is released.
      let releaseBlocker!: () => void;
      let signalBlockerReady!: () => void;
      const blockerGate = new Promise<void>((resolve) => { releaseBlocker = resolve; });
      const blockerReady = new Promise<void>((resolve) => { signalBlockerReady = resolve; });
      const blockerTransaction = prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(
          'SELECT "id" FROM "GuestIdentity" WHERE "id" = $1::uuid FOR UPDATE',
          guestId,
        );
        signalBlockerReady();
        await blockerGate;
      });

      const waitForGuestLockWaiters = async (expected: number) => {
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
            "SELECT COUNT(*)::bigint AS count FROM pg_stat_activity " +
            "WHERE datname = current_database() AND wait_event_type = 'Lock' " +
            "AND query ILIKE '%GuestIdentity%' AND query ILIKE '%FOR UPDATE%'",
          );
          if (Number(rows[0]?.count ?? 0n) >= expected) return;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        throw new Error('Timed out waiting for ' + expected + ' GuestIdentity row-lock waiter(s)');
      };

      let conversion: Awaited<ReturnType<typeof guests.convert>> | undefined;
      let settlementPromise: Promise<void> | undefined;
      try {
        await blockerReady;
        if (ordering === 'conversion-first') {
          const conversionPromise = convertGuest();
          await waitForGuestLockWaiters(1);
          settlementPromise = prisma.$transaction((tx) => settlement.settleCompletedMatch(tx, match.id));
          await waitForGuestLockWaiters(2);
          releaseBlocker();
          conversion = await conversionPromise;
          await settlementPromise;
        } else {
          settlementPromise = prisma.$transaction((tx) => settlement.settleCompletedMatch(tx, match.id));
          await waitForGuestLockWaiters(1);
          const conversionPromise = convertGuest();
          await waitForGuestLockWaiters(2);
          releaseBlocker();
          await settlementPromise;
          conversion = await conversionPromise;
        }
        await blockerTransaction;
      } finally {
        releaseBlocker();
        await blockerTransaction.catch(() => undefined);
      }

      if (!conversion) throw new Error('Guest conversion did not return a result');
      const userId = conversion.principal.principalId;
      convertedUserIds.push(userId);

      const [guest, guestProgress, userProgress, userXpEvents, guestXpEvents, opponentProgress] = await Promise.all([
        prisma.guestIdentity.findUniqueOrThrow({ where: { id: guestId } }),
        prisma.guestProgress.findUnique({ where: { guestIdentityId: guestId } }),
        prisma.userProgress.findUnique({ where: { userId } }),
        prisma.xPTransaction.findMany({ where: { userId, matchId: match.id } }),
        prisma.guestXPTransaction.findMany({ where: { guestIdentityId: guestId, matchId: match.id } }),
        prisma.userProgress.findUnique({ where: { userId: opponent.id } }),
      ]);

      expect(guest).toMatchObject({
        status: GuestIdentityStatus.CONVERTED,
        convertedToUserId: userId,
      });
      expect(userProgress?.totalXp).toBe(BigInt(17));
      expect(userXpEvents).toHaveLength(1);
      expect(userXpEvents[0]).toMatchObject({ amount: 17 });
      expect(['MATCH_REWARD', 'GUEST_CONVERSION_TRANSFER']).toContain(userXpEvents[0].reason);
      expect(guestXpEvents.length).toBeLessThanOrEqual(1);
      if (guestXpEvents.length === 1) {
        expect(guestXpEvents[0]).toMatchObject({ amount: 17, reason: 'MATCH_REWARD' });
        expect(guestProgress?.transferredAt).toBeInstanceOf(Date);
        expect(userXpEvents[0].reason).toBe('GUEST_CONVERSION_TRANSFER');
      } else {
        expect(guestProgress).toBeNull();
        expect(userXpEvents[0].reason).toBe('MATCH_REWARD');
      }
      expect(opponentProgress?.totalXp).toBe(BigInt(11));
    },
    30_000,
  );


});
