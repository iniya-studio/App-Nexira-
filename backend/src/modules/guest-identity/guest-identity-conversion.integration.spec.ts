import { ConfigService } from '@nestjs/config';
import { ConflictException, GoneException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GuestIdentityStatus, PrincipalType, Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { MatchService } from '../match/match.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { RoundService } from '../match/round.service';
import { AnswerService } from '../match/answer.service';
import { EmailVerificationService } from '../auth/email-verification.service';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../session/session.service';
import { AccessTokenService } from '../identity/access-token.service';
import { GuestIdentityService } from './guest-identity.service';

describe('Guest conversion during an active public 1v1 match integration', () => {
  const prisma = new PrismaService();
  const matches = new MatchService(prisma);
  const rounds = new RoundService(prisma);
  const answers = new AnswerService(prisma);
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
    if (guestIds.length) {
      await prisma.guestConversionReplay.deleteMany({ where: { guestIdentityId: { in: guestIds } } });
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

    const sourceRefreshToken = randomBytes(32).toString('base64url');
    const idempotencyKey = randomBytes(32).toString('base64url');
    await prisma.refreshToken.create({
      data: {
        sessionId: firstSession.id,
        tokenHash: createHash('sha256').update(sourceRefreshToken).digest('hex'),
        expiresAt,
        idempotencyKeyHash: createHash('sha256').update(randomUUID()).digest('hex'),
      },
    });

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
    const activeRound = await rounds.startNextRound(matchId, {
      category: 'general',
      difficulty: 'medium',
      canonicalLanguage: 'en',
      answerType: 'FREE_TEXT',
      canonicalPrompt: 'Which planet is known as the Red Planet?',
      canonicalOptions: null,
      answerKey: 'Mars',
      gradingRubric: { requiredConcepts: ['Mars'], acceptEquivalentWording: true },
      localized: { en: { prompt: 'Which planet is known as the Red Planet?' } },
      timeLimitSeconds: 30,
      contentVersion: `guest-conversion-${randomUUID()}`,
      generatorVersion: 'integration-generator-v1',
      modelVersion: 'integration-model-v1',
      generationPolicyVersion: 'guest-conversion-v1',
    });
    questionIds.push(activeRound.questionId);

    const configValues: Record<string, string> = {
      ARGON2_MEMORY_COST_KIB: '1024',
      ARGON2_TIME_COST: '2',
      ARGON2_PARALLELISM: '1',
      JWT_SECRET: Buffer.alloc(32, 7).toString('base64'),
      JWT_ISSUER: 'https://integration.nexira.test',
      JWT_AUDIENCE: 'nexira-integration',
      SESSION_ABSOLUTE_TTL_SECONDS: '3600',
      REFRESH_TOKEN_TTL_SECONDS: '1800',
      REFRESH_RETRY_WINDOW_SECONDS: '60',
      REFRESH_RETRY_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString('base64'),
      GUEST_CONVERSION_REPLAY_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      GUEST_CONVERSION_REPLAY_WINDOW_SECONDS: '300',
      ACCESS_TOKEN_TTL_SECONDS: '900',
    };
    const config = {
      get: jest.fn((key: string, fallback?: string) => configValues[key] ?? fallback),
      getOrThrow: jest.fn((key: string) => { const value = configValues[key]; if (!value) throw new Error(key); return value; }),
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
        const userRefreshToken = randomBytes(32).toString('base64url');
        await tx.refreshToken.create({
          data: {
            sessionId: session.id,
            tokenHash: createHash('sha256').update(userRefreshToken).digest('hex'),
            expiresAt: userSessionExpiresAt,
            idempotencyKeyHash: createHash('sha256').update(randomUUID()).digest('hex'),
          },
        });
        return {
          principal: owner,
          session: { sessionId: session.id, expiresAt: userSessionExpiresAt.toISOString() },
          tokens: {
            accessToken: 'integration-access-token',
            accessTokenExpiresAt: userSessionExpiresAt.toISOString(),
            refreshToken: userRefreshToken,
            refreshTokenExpiresAt: userSessionExpiresAt.toISOString(),
          },
        };
      }),
    };
    const emailVerification = { issueAndSend: jest.fn().mockRejectedValue(new Error('mail transport unavailable')) };
    const auth = new AuthService(
      prisma,
      sessions as unknown as SessionService,
      config as unknown as ConfigService,
      {} as never,
      emailVerification as unknown as EmailVerificationService,
    );
    const conversion = new GuestIdentityService(
      prisma,
      sessions as unknown as SessionService,
      config as unknown as ConfigService,
      emailVerification as unknown as EmailVerificationService,
      auth,
    );

    await expect(conversion.retryConversion(sourceRefreshToken, idempotencyKey)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.guestIdentity.findUniqueOrThrow({ where: { id: firstGuest.id } }))
      .toMatchObject({ status: GuestIdentityStatus.ACTIVE, convertedToUserId: null });

    const conversionInput = {
      email: `guest-${randomUUID()}@example.test`,
      password: 'integration-password-123',
      username: `guest_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      displayName: 'Guest One Converted',
      refreshToken: sourceRefreshToken,
    };
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "nexira_test_guest_replay_failure" ON "GuestConversionReplay"');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS "nexira_test_guest_replay_failure_fn"()');
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "nexira_test_guest_replay_failure_fn"() RETURNS trigger LANGUAGE plpgsql AS $nexira$ BEGIN IF NEW."guestIdentityId" = '${firstGuest.id}'::uuid THEN RAISE EXCEPTION 'forced replay persistence failure'; END IF; RETURN NEW; END; $nexiraimport { ConfigService } from '@nestjs/config';
import { ConflictException, GoneException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GuestIdentityStatus, PrincipalType, Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { MatchService } from '../match/match.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { RoundService } from '../match/round.service';
import { AnswerService } from '../match/answer.service';
import { EmailVerificationService } from '../auth/email-verification.service';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../session/session.service';
import { AccessTokenService } from '../identity/access-token.service';
import { GuestIdentityService } from './guest-identity.service';

describe('Guest conversion during an active public 1v1 match integration', () => {
  const prisma = new PrismaService();
  const matches = new MatchService(prisma);
  const rounds = new RoundService(prisma);
  const answers = new AnswerService(prisma);
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
    if (guestIds.length) {
      await prisma.guestConversionReplay.deleteMany({ where: { guestIdentityId: { in: guestIds } } });
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

    const sourceRefreshToken = randomBytes(32).toString('base64url');
    const idempotencyKey = randomBytes(32).toString('base64url');
    await prisma.refreshToken.create({
      data: {
        sessionId: firstSession.id,
        tokenHash: createHash('sha256').update(sourceRefreshToken).digest('hex'),
        expiresAt,
        idempotencyKeyHash: createHash('sha256').update(randomUUID()).digest('hex'),
      },
    });

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
    const activeRound = await rounds.startNextRound(matchId, {
      category: 'general',
      difficulty: 'medium',
      canonicalLanguage: 'en',
      answerType: 'FREE_TEXT',
      canonicalPrompt: 'Which planet is known as the Red Planet?',
      canonicalOptions: null,
      answerKey: 'Mars',
      gradingRubric: { requiredConcepts: ['Mars'], acceptEquivalentWording: true },
      localized: { en: { prompt: 'Which planet is known as the Red Planet?' } },
      timeLimitSeconds: 30,
      contentVersion: `guest-conversion-${randomUUID()}`,
      generatorVersion: 'integration-generator-v1',
      modelVersion: 'integration-model-v1',
      generationPolicyVersion: 'guest-conversion-v1',
    });
    questionIds.push(activeRound.questionId);

    const configValues: Record<string, string> = {
      ARGON2_MEMORY_COST_KIB: '1024',
      ARGON2_TIME_COST: '2',
      ARGON2_PARALLELISM: '1',
      JWT_SECRET: Buffer.alloc(32, 7).toString('base64'),
      JWT_ISSUER: 'https://integration.nexira.test',
      JWT_AUDIENCE: 'nexira-integration',
      SESSION_ABSOLUTE_TTL_SECONDS: '3600',
      REFRESH_TOKEN_TTL_SECONDS: '1800',
      REFRESH_RETRY_WINDOW_SECONDS: '60',
      REFRESH_RETRY_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString('base64'),
      GUEST_CONVERSION_REPLAY_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      GUEST_CONVERSION_REPLAY_WINDOW_SECONDS: '300',
      ACCESS_TOKEN_TTL_SECONDS: '900',
    };
    const config = {
      get: jest.fn((key: string, fallback?: string) => configValues[key] ?? fallback),
      getOrThrow: jest.fn((key: string) => { const value = configValues[key]; if (!value) throw new Error(key); return value; }),
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
        const userRefreshToken = randomBytes(32).toString('base64url');
        await tx.refreshToken.create({
          data: {
            sessionId: session.id,
            tokenHash: createHash('sha256').update(userRefreshToken).digest('hex'),
            expiresAt: userSessionExpiresAt,
            idempotencyKeyHash: createHash('sha256').update(randomUUID()).digest('hex'),
          },
        });
        return {
          principal: owner,
          session: { sessionId: session.id, expiresAt: userSessionExpiresAt.toISOString() },
          tokens: {
            accessToken: 'integration-access-token',
            accessTokenExpiresAt: userSessionExpiresAt.toISOString(),
            refreshToken: userRefreshToken,
            refreshTokenExpiresAt: userSessionExpiresAt.toISOString(),
          },
        };
      }),
    };
    const emailVerification = { issueAndSend: jest.fn().mockRejectedValue(new Error('mail transport unavailable')) };
    const auth = new AuthService(
      prisma,
      sessions as unknown as SessionService,
      config as unknown as ConfigService,
      {} as never,
      emailVerification as unknown as EmailVerificationService,
    );
    const conversion = new GuestIdentityService(
      prisma,
      sessions as unknown as SessionService,
      config as unknown as ConfigService,
      emailVerification as unknown as EmailVerificationService,
      auth,
    );

    await expect(conversion.retryConversion(sourceRefreshToken, idempotencyKey)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.guestIdentity.findUniqueOrThrow({ where: { id: firstGuest.id } }))
      .toMatchObject({ status: GuestIdentityStatus.ACTIVE, convertedToUserId: null });

    const conversionInput = {
      email: `guest-${randomUUID()}@example.test`,
      password: 'integration-password-123',
      username: `guest_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      displayName: 'Guest One Converted',
      refreshToken: sourceRefreshToken,
    };
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "nexira_test_guest_replay_failure" ON "GuestConversionReplay"');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS "nexira_test_guest_replay_failure_fn"()');
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "nexira_test_guest_replay_failure_fn"() RETURNS trigger LANGUAGE plpgsql AS $nexira$ BEGIN IF NEW."guestIdentityId" = '${firstGuest.id}'::uuid THEN RAISE EXCEPTION 'forced replay persistence failure'; END IF; );
    await prisma.$executeRawUnsafe('CREATE TRIGGER "nexira_test_guest_replay_failure" BEFORE INSERT ON "GuestConversionReplay" FOR EACH ROW EXECUTE FUNCTION "nexira_test_guest_replay_failure_fn"()');
    try {
      await expect(conversion.convert(firstPrincipal, conversionInput, idempotencyKey)).rejects.toThrow('forced replay persistence failure');
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "nexira_test_guest_replay_failure" ON "GuestConversionReplay"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS "nexira_test_guest_replay_failure_fn"()');
    }
    expect(await prisma.guestIdentity.findUniqueOrThrow({ where: { id: firstGuest.id } }))
      .toMatchObject({ status: GuestIdentityStatus.ACTIVE, convertedToUserId: null });
    expect(await prisma.user.findUnique({ where: { email: conversionInput.email } })).toBeNull();
    expect(await prisma.guestConversionReplay.count({ where: { guestIdentityId: firstGuest.id } })).toBe(0);
    expect(await prisma.userSession.findUniqueOrThrow({ where: { id: firstSession.id } })).toMatchObject({ revokedAt: null });
    const sourceTokenRecord = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: createHash('sha256').update(sourceRefreshToken).digest('hex') },
    });
    expect(sourceTokenRecord.revokedAt).toBeNull();

    const converted = await conversion.convert(firstPrincipal, conversionInput, idempotencyKey);
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
    expect(converted.emailVerification).toMatchObject({ required: true, verified: false });
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

    // Simulate a lost HTTP response: recover using only the original guest refresh token and idempotency key.
    const [recovered, concurrentRecovery] = await Promise.all([
      conversion.retryConversion(sourceRefreshToken, idempotencyKey),
      conversion.retryConversion(sourceRefreshToken, idempotencyKey),
    ]);
    expect(recovered).toEqual(converted);
    expect(concurrentRecovery).toEqual(converted);
    expect(await prisma.guestConversionReplay.count({ where: { guestIdentityId: firstGuest.id } })).toBe(1);
    expect(await prisma.user.count({ where: { id: converted.user.id } })).toBe(1);
    expect(await prisma.userSession.count({ where: { userId: converted.user.id } })).toBe(1);
    expect(await prisma.refreshToken.count({ where: { session: { userId: converted.user.id } } })).toBe(1);

    await expect(conversion.retryConversion(randomBytes(32).toString('base64url'), idempotencyKey))
      .rejects.toBeInstanceOf(UnauthorizedException);
    const replayBeforeTamper = await prisma.guestConversionReplay.findUniqueOrThrow({ where: { guestIdentityId: firstGuest.id } });
    await prisma.guestConversionReplay.update({
      where: { guestIdentityId: firstGuest.id },
      data: { responseCiphertext: `${replayBeforeTamper.responseCiphertext}tampered` },
    });
    await expect(conversion.retryConversion(sourceRefreshToken, idempotencyKey)).rejects.toBeInstanceOf(UnauthorizedException);
    await prisma.guestConversionReplay.update({
      where: { guestIdentityId: firstGuest.id },
      data: { responseCiphertext: replayBeforeTamper.responseCiphertext },
    });

    const refreshService = new SessionService(
      prisma,
      config as unknown as ConfigService,
      new AccessTokenService(config as unknown as ConfigService),
    );
    const refreshed = await refreshService.refresh(
      recovered.tokens.refreshToken, randomBytes(32).toString('base64url'),
    );
    expect(refreshed.principal).toEqual(converted.principal);
    expect(await prisma.refreshToken.count({ where: { session: { userId: converted.user.id } } })).toBe(2);
    expect(emailVerification.issueAndSend).toHaveBeenCalledTimes(1);
    const auditRows = await prisma.identityAuditEvent.findMany({
      where: { principalId: firstGuest.id },
      select: { metadata: true },
    });
    const auditPayload = JSON.stringify(auditRows);
    expect(auditPayload).not.toContain(sourceRefreshToken);
    expect(auditPayload).not.toContain(idempotencyKey);
    expect(auditPayload).not.toContain(conversionInput.password);
    expect(auditPayload).not.toContain(converted.tokens.accessToken);
    expect(auditPayload).not.toContain(converted.tokens.refreshToken);

    await expect(conversion.retryConversion(
      sourceRefreshToken, randomBytes(32).toString('base64url'),
    )).rejects.toBeInstanceOf(UnauthorizedException);

    await prisma.guestConversionReplay.update({
      where: { guestIdentityId: firstGuest.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const cleanupCounts = await Promise.all([
      conversion.purgeExpiredReplayCiphertexts(1),
      conversion.purgeExpiredReplayCiphertexts(1),
    ]);
    expect(cleanupCounts.every((count) => count >= 0 && count <= 1)).toBe(true);
    expect(cleanupCounts.reduce((sum, count) => sum + count, 0)).toBe(1);
    const purgedReplay = await prisma.guestConversionReplay.findUniqueOrThrow({
      where: { guestIdentityId: firstGuest.id },
    });
    expect(purgedReplay.responseCiphertext).toBeNull();
    expect(purgedReplay.ciphertextPurgedAt).toBeInstanceOf(Date);
    expect(await prisma.guestConversionReplay.count({ where: { guestIdentityId: firstGuest.id } })).toBe(1);
    await expect(conversion.retryConversion(sourceRefreshToken, idempotencyKey))
      .rejects.toBeInstanceOf(GoneException);

    const participants = await prisma.matchParticipant.findMany({
      where: { matchId },
      orderBy: { joinedAt: 'asc' },
    });
    expect(participants).toHaveLength(2);
    const convertedParticipant = participants.find((participant) => participant.userId === converted.user.id);
    const opponentParticipant = participants.find((participant) => participant.guestIdentityId === secondGuest.id);
    expect(convertedParticipant).toMatchObject({
      userId: converted.user.id,
      guestIdentityId: null,
      status: 'ACTIVE',
    });
    expect(opponentParticipant).toMatchObject({
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
      match: { id: matchId, status: 'ACTIVE', currentRound: 1 },
    });
    expect(opponentRecovery).toMatchObject({
      status: 'MATCHED',
      matchId,
      match: { id: matchId, status: 'ACTIVE', currentRound: 1 },
    });

    const [convertedMatch, opponentMatch] = await Promise.all([
      matches.getMatch(matchId, convertedPrincipal),
      matches.getMatch(matchId, secondPrincipal),
    ]);
    expect(convertedMatch).toMatchObject({ status: 'ACTIVE', currentRound: 1 });
    expect(opponentMatch).toMatchObject({ status: 'ACTIVE', currentRound: 1 });
    expect(convertedMatch.participants.filter((participant) => participant.isSelf)).toHaveLength(1);
    expect(opponentMatch.participants.filter((participant) => participant.isSelf)).toHaveLength(1);
    const [convertedQuestion, opponentQuestion] = await Promise.all([
      rounds.getRoundQuestion(matchId, activeRound.roundId, convertedPrincipal, 'en'),
      rounds.getRoundQuestion(matchId, activeRound.roundId, secondPrincipal, 'en'),
    ]);
    expect(convertedQuestion.questionId).toBe(activeRound.questionId);
    expect(opponentQuestion.questionId).toBe(activeRound.questionId);
    expect(convertedQuestion.deadlineAt).toEqual(opponentQuestion.deadlineAt);
    expect(convertedQuestion.prompt).toBe(opponentQuestion.prompt);
    const [convertedAnswer, opponentAnswer] = await Promise.all([
      answers.submitAnswer(matchId, activeRound.roundId, convertedPrincipal, 'Mars', `converted-${randomUUID()}`),
      answers.submitAnswer(matchId, activeRound.roundId, secondPrincipal, 'The Red Planet', `opponent-${randomUUID()}`),
    ]);
    expect(convertedAnswer).toMatchObject({ matchId, roundId: activeRound.roundId, status: 'ACCEPTED' });
    expect(opponentAnswer).toMatchObject({ matchId, roundId: activeRound.roundId, status: 'ACCEPTED' });
    await expect(answers.submitAnswer(
      matchId, activeRound.roundId, firstPrincipal, 'Mars', `stale-guest-${randomUUID()}`,
    )).rejects.toBeInstanceOf(NotFoundException);
    await expect(matches.getMatch(matchId, firstPrincipal)).rejects.toBeInstanceOf(NotFoundException);
    await expect(rounds.getRoundQuestion(matchId, activeRound.roundId, firstPrincipal, 'en'))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(matchmaking.getMine(firstPrincipal)).resolves.toMatchObject({ status: 'NOT_QUEUED' });
  });
});
