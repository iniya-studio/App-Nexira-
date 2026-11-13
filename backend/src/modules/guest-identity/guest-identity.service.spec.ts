import { ConfigService } from '@nestjs/config';
import { GuestIdentityService } from './guest-identity.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../session/session.service';
import { EmailVerificationService } from '../auth/email-verification.service';

describe('GuestIdentityService', () => {
  const emailVerification = {
    issueAndSend: jest.fn().mockResolvedValue('SENT'),
  } as unknown as EmailVerificationService;

  it('creates guest identity and its session in one transaction', async () => {
    const tx = {
      guestIdentity: { create: jest.fn().mockResolvedValue({ id: 'guest-1' }) },
      identityAuditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const sessionResponse = {
      principal: { principalType: 'GUEST', principalId: 'guest-1' },
      session: { sessionId: 'session-1', expiresAt: new Date().toISOString() },
      tokens: {
        accessToken: 'access',
        accessTokenExpiresAt: new Date().toISOString(),
        refreshToken: 'refresh',
        refreshTokenExpiresAt: new Date().toISOString(),
      },
    };
    const sessions = {
      createSessionInTransaction: jest.fn().mockResolvedValue(sessionResponse),
    } as unknown as SessionService;
    const config = {
      get: (key: string, fallback: string) => fallback,
    } as unknown as ConfigService;
    const service = new GuestIdentityService(prisma, sessions, config, emailVerification);

    await expect(service.start('127.0.0.1')).resolves.toEqual(sessionResponse);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.guestIdentity.create).toHaveBeenCalledWith({ data: { status: 'ACTIVE' } });
    expect(sessions.createSessionInTransaction).toHaveBeenCalledWith(tx, {
      principalType: 'GUEST',
      principalId: 'guest-1',
    });
    expect(tx.identityAuditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('limits repeated guest starts from the same client key', async () => {
    const tx = {
      guestIdentity: { create: jest.fn().mockResolvedValue({ id: 'guest-1' }) },
      identityAuditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const sessions = {
      createSessionInTransaction: jest.fn().mockResolvedValue({ session: { sessionId: 's' } }),
    } as unknown as SessionService;
    const config = {
      get: (key: string, fallback: string) => key === 'GUEST_START_MAX_ATTEMPTS' ? '1' : fallback,
    } as unknown as ConfigService;
    const service = new GuestIdentityService(prisma, sessions, config, emailVerification);

    await service.start('127.0.0.2');
    await expect(service.start('127.0.0.2')).rejects.toThrow();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
