import * as argon2 from 'argon2';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrincipalType } from '@prisma/client';
import { PasswordLifecycleService } from './password-lifecycle.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { EmailDeliveryService } from './email-delivery.service';

describe('PasswordLifecycleService', () => {
  const user = { id: 'user-1', email: 'player@example.test', status: 'ACTIVE' };
  const principal = { principalType: PrincipalType.USER, principalId: 'user-1', sessionId: 'current-session' };
  let service: PasswordLifecycleService;
  let prisma: any;
  let tx: any;
  let delivery: any;
  beforeEach(() => {
    tx = {
      passwordResetToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn().mockResolvedValue({}) },
      user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      accountCredential: { upsert: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      userSession: { findMany: jest.fn().mockResolvedValue([{ id: 'current-session' }, { id: 'other-session' }]), updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      identityAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      user: { findUnique: jest.fn(), findFirst: jest.fn() },
      passwordResetToken: { findUnique: jest.fn() },
      $transaction: jest.fn((callback: (transaction: any) => unknown) => callback(tx)),
    };
    delivery = { isPasswordResetConfigured: jest.fn().mockReturnValue(true), sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn((key: string) => ({
      PASSWORD_RESET_TOKEN_TTL_SECONDS: '1800', ARGON2_MEMORY_COST_KIB: '1024',
      ARGON2_TIME_COST: '2', ARGON2_PARALLELISM: '1',
    })[key]) };
    service = new PasswordLifecycleService(prisma as PrismaService, config as ConfigService, delivery as EmailDeliveryService);
  });

  it('returns the same accepted response for an unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.requestReset('missing@example.test', '127.0.0.1')).resolves.toEqual({ accepted: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not create a token if reset delivery is not configured', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    delivery.isPasswordResetConfigured.mockReturnValue(false);
    await expect(service.requestReset(user.email, '127.0.0.1')).resolves.toEqual({ accepted: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('persists only a hash and sends the raw token through email', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    await service.requestReset(user.email, '127.0.0.1');
    const storedHash = tx.passwordResetToken.create.mock.calls[0][0].data.tokenHash;
    const sentToken = delivery.sendPasswordResetEmail.mock.calls[0][1];
    expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sentToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(storedHash).not.toBe(sentToken);
  });

  it('rejects malformed tokens without a database lookup', async () => {
    await expect(service.resetPassword('invalid', 'a-long-and-strong-password')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
  });

  it('updates credentials and revokes all sessions in a reset transaction', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1', userId: user.id, consumedAt: null, expiresAt: new Date(Date.now() + 60000), user,
    });
    const result = await service.resetPassword('A'.repeat(43), 'a-long-and-strong-password');
    expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'reset-1', consumedAt: null }) }));
    expect(tx.accountCredential.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: user.id } }));
    expect(tx.userSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: user.id, revokedAt: null } }));
    expect(tx.refreshToken.updateMany).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('rejects password changes from guests', async () => {
    await expect(service.changePassword(
      { principalType: PrincipalType.GUEST, principalId: 'guest-1', sessionId: 'guest-session' },
      'current-password', 'a-long-and-strong-password',
    )).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('preserves the current session during authenticated password change', async () => {
    const passwordHash = await argon2.hash('current-password', { type: argon2.argon2id, memoryCost: 1024, timeCost: 2, parallelism: 1 });
    prisma.user.findFirst.mockResolvedValue({ credential: { id: 'credential-1', passwordHash } });
    await service.changePassword(principal, 'current-password', 'a-new-strong-password');
    expect(tx.userSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: user.id, id: { not: principal.sessionId } }),
    }));
  });
});
