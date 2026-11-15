import { ConfigService } from '@nestjs/config';
import { PrincipalType } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenService } from '../identity/access-token.service';
import { PasswordLifecycleService } from './password-lifecycle.service';
import { EmailDeliveryService } from './email-delivery.service';
import { SessionService } from '../session/session.service';

describe('Password lifecycle PostgreSQL integration', () => {
  const values: Record<string, string> = {
    JWT_SECRET: Buffer.alloc(32, 23).toString('base64'),
    JWT_ISSUER: 'https://password-integration.nexira.test',
    JWT_AUDIENCE: 'nexira-password-integration',
    ACCESS_TOKEN_TTL_SECONDS: '900',
    SESSION_ABSOLUTE_TTL_SECONDS: '3600',
    REFRESH_TOKEN_TTL_SECONDS: '1800',
    ARGON2_MEMORY_COST_KIB: '1024',
    ARGON2_TIME_COST: '2',
    ARGON2_PARALLELISM: '1',
    PASSWORD_RESET_TOKEN_TTL_SECONDS: '1800',
  };
  const config = {
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing integration config: ${key}`);
      return value;
    },
    get: (key: string) => values[key],
  } as unknown as ConfigService;
  const prisma = new PrismaService();
  const accessTokens = new AccessTokenService(config);
  const sessions = new SessionService(prisma, config, accessTokens);
  const delivery = {
    isPasswordResetConfigured: () => true,
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  } as unknown as EmailDeliveryService;
  const passwords = new PasswordLifecycleService(prisma, config, delivery);
  const userIds: string[] = [];

  beforeAll(async () => { await prisma.$connect(); });

  afterEach(async () => {
    if (userIds.length) {
      await prisma.identityAuditEvent.deleteMany({ where: { principalId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('resets a password once, revokes every session, and preserves only the current session on later password change', async () => {
    const oldPassword = 'old-integration-password-strong';
    const resetPassword = 'new-integration-password-strong';
    const changedPassword = 'changed-integration-password-strong';
    const user = await prisma.user.create({
      data: {
        email: `password-${randomUUID()}@example.test`,
        username: `pw_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        displayName: 'Password Integration',
        credential: {
          create: {
            passwordHash: await argon2.hash(oldPassword, { type: argon2.argon2id, memoryCost: 1024, timeCost: 2, parallelism: 1 }),
          },
        },
      },
    });
    userIds.push(user.id);

    const first = await prisma.$transaction((tx) => sessions.createSessionInTransaction(tx, {
      principalType: PrincipalType.USER, principalId: user.id,
    }));
    const second = await prisma.$transaction((tx) => sessions.createSessionInTransaction(tx, {
      principalType: PrincipalType.USER, principalId: user.id,
    }));
    const rawToken = randomBytes(32).toString('base64url');
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: new Date(Date.now() + 60000),
      },
    });

    const reset = await passwords.resetPassword(rawToken, resetPassword);
    expect(reset.sessionsRevoked).toBe(2);
    const credentialAfterReset = await prisma.accountCredential.findUnique({ where: { userId: user.id } });
    expect(await argon2.verify(credentialAfterReset!.passwordHash, resetPassword)).toBe(true);
    expect(await argon2.verify(credentialAfterReset!.passwordHash, oldPassword)).toBe(false);
    const resetSessions = await prisma.userSession.findMany({ where: { userId: user.id } });
    expect(resetSessions).toHaveLength(2);
    expect(resetSessions.every((session) => session.revokedAt instanceof Date)).toBe(true);
    const oldRefreshTokens = await prisma.refreshToken.findMany({
      where: { sessionId: { in: [first.session.sessionId, second.session.sessionId] } },
    });
    expect(oldRefreshTokens.length).toBeGreaterThanOrEqual(2);
    expect(oldRefreshTokens.every((token) => token.revokedAt instanceof Date)).toBe(true);
    await expect(passwords.resetPassword(rawToken, 'another-integration-password')).rejects.toThrow();

    const current = await prisma.$transaction((tx) => sessions.createSessionInTransaction(tx, {
      principalType: PrincipalType.USER, principalId: user.id,
    }));
    const other = await prisma.$transaction((tx) => sessions.createSessionInTransaction(tx, {
      principalType: PrincipalType.USER, principalId: user.id,
    }));
    const pendingToken = randomBytes(32).toString('base64url');
    const pending = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(pendingToken).digest('hex'),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const changed = await passwords.changePassword({
      principalType: PrincipalType.USER, principalId: user.id, sessionId: current.session.sessionId,
    }, resetPassword, changedPassword);
    expect(changed.sessionsRevoked).toBe(1);
    const [currentSession, otherSession, pendingAfterChange, finalCredential] = await Promise.all([
      prisma.userSession.findUnique({ where: { id: current.session.sessionId } }),
      prisma.userSession.findUnique({ where: { id: other.session.sessionId } }),
      prisma.passwordResetToken.findUnique({ where: { id: pending.id } }),
      prisma.accountCredential.findUnique({ where: { userId: user.id } }),
    ]);
    expect(currentSession?.revokedAt).toBeNull();
    expect(otherSession?.revokedAt).toBeInstanceOf(Date);
    expect(pendingAfterChange?.consumedAt).toBeInstanceOf(Date);
    expect(await argon2.verify(finalCredential!.passwordHash, changedPassword)).toBe(true);
  });
});
