import { ConfigService } from '@nestjs/config';
import { GuestIdentityStatus, PrincipalType } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenGuard } from '../identity/access-token.guard';
import { AccessTokenService } from '../identity/access-token.service';
import { GuestIdentityService } from '../guest-identity/guest-identity.service';
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
  const guestIds: string[] = [];
  const convertedUserIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (guestIds.length) {
      await prisma.userSession.deleteMany({ where: { guestIdentityId: { in: guestIds } } });
      await prisma.identityAuditEvent.deleteMany({ where: { principalId: { in: guestIds } } });
      await prisma.guestIdentity.deleteMany({ where: { id: { in: guestIds } } });
      guestIds.length = 0;
    }
    if (convertedUserIds.length) {
      await prisma.identityAuditEvent.deleteMany({ where: { principalId: { in: convertedUserIds } } });
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

    const result = await guests.convert({
      principalType: PrincipalType.GUEST,
      principalId: guestId,
      sessionId: guestSessionId,
    }, {
      email: `conversion-${randomUUID()}@example.test`,
      password: 'integration-test-password-strong',
      username: `player_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      displayName: 'Integration Player',
    });

    const userId = result.principal.principalId;
    convertedUserIds.push(userId);

    expect(result.principal.principalType).toBe(PrincipalType.USER);
    expect(await accessGuard.authenticate(result.tokens.accessToken)).toEqual({
      principalType: PrincipalType.USER,
      principalId: userId,
      sessionId: result.session.sessionId,
    });

    const [guest, transferredProfile, oldSession, newSession, oldRefreshTokens, audit] = await Promise.all([
      prisma.guestIdentity.findUnique({ where: { id: guestId } }),
      prisma.companionProfile.findUnique({ where: { id: companion.id } }),
      prisma.userSession.findUnique({ where: { id: guestSessionId } }),
      prisma.userSession.findUnique({ where: { id: result.session.sessionId } }),
      prisma.refreshToken.findMany({ where: { sessionId: guestSessionId } }),
      prisma.identityAuditEvent.findFirst({
        where: { principalType: PrincipalType.GUEST, principalId: guestId, eventType: 'GUEST_IDENTITY_CONVERTED' },
      }),
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

    await expect(accessGuard.authenticate(started.tokens.accessToken)).rejects.toThrow();
    await expect(
      sessions.refresh(started.tokens.refreshToken, randomBytes(32).toString('base64url')),
    ).rejects.toThrow();
    expect(result.emailVerification).toEqual({
      required: true,
      verified: false,
      delivery: 'SENT',
    });
  });

});
