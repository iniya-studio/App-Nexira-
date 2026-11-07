import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailDeliveryService } from './email-delivery.service';
import { EmailVerificationService } from './email-verification.service';

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;
  let prisma: any;
  let tx: any;
  let delivery: { isConfigured: jest.Mock; sendVerificationEmail: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(() => {
    tx = {
      emailVerificationToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn().mockResolvedValue({}) },
      user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      identityAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      user: { findUnique: jest.fn() },
      emailVerificationToken: { findUnique: jest.fn() },
      identityAuditEvent: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((callback: (t: any) => Promise<unknown>) => callback(tx)),
    };
    delivery = { isConfigured: jest.fn().mockReturnValue(true), sendVerificationEmail: jest.fn().mockResolvedValue(undefined) };
    config = { get: jest.fn((key: string) => ({
      EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: '86400',
      EMAIL_VERIFICATION_RESEND_MAX_ATTEMPTS: '3',
      EMAIL_VERIFICATION_RESEND_WINDOW_SECONDS: '3600',
    })[key]) };
    service = new EmailVerificationService(prisma as PrismaService, config as unknown as ConfigService, delivery as unknown as EmailDeliveryService);
  });

  it('stores only a SHA-256 hash and sends a high-entropy token', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'player@example.com', emailVerifiedAt: null, status: 'ACTIVE' });
    expect(await service.issueAndSend('u1')).toBe('SENT');
    const data = tx.emailVerificationToken.create.mock.calls[0][0].data;
    const raw = delivery.sendVerificationEmail.mock.calls[0][1];
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(data.tokenHash).toBe(createHash('sha256').update(raw).digest('hex'));
    expect(data.tokenHash).not.toBe(raw);
  });

  it('does not issue tokens without SMTP configuration', async () => {
    delivery.isConfigured.mockReturnValue(false);
    expect(await service.issueAndSend('u1')).toBe('NOT_CONFIGURED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('consumes a valid token and verifies the user in a transaction', async () => {
    const token = 'A'.repeat(43);
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 't1', userId: 'u1', consumedAt: null, expiresAt: new Date(Date.now() + 60000),
      user: { status: 'ACTIVE', email: 'player@example.com' },
    });
    expect(await service.verify(token)).toEqual({ verified: true });
    expect(tx.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1', status: 'ACTIVE', emailVerifiedAt: null },
    }));
  });

  it('rejects an unknown token', async () => {
    prisma.emailVerificationToken.findUnique.mockResolvedValue(null);
    await expect(service.verify('A'.repeat(43))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rate-limits resend requests per user', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'player@example.com', emailVerifiedAt: null, status: 'ACTIVE' });
    const principal = { principalType: 'USER', principalId: 'u1', sessionId: 's1' } as any;
    await service.resend(principal);
    await service.resend(principal);
    await service.resend(principal);
    await expect(service.resend(principal)).rejects.toBeInstanceOf(HttpException);
    await expect(service.resend(principal)).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });
});
