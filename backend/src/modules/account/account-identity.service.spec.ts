import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrincipalType } from '@prisma/client';
import { AccountIdentityService } from './account-identity.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleIdentityVerifier } from '../auth/google-identity-verifier';

describe('AccountIdentityService', () => {
  const principal = { principalType: PrincipalType.USER, principalId: 'user-1', sessionId: 'session-1' };
  const verifiedUser = { id: 'user-1', email: 'player@example.test', emailVerifiedAt: new Date() };
  let service: AccountIdentityService;
  let prisma: any;
  let tx: any;
  let google: any;

  beforeEach(() => {
    tx = {
      user: { findFirst: jest.fn().mockResolvedValue(verifiedUser) },
      externalIdentity: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      identityAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(verifiedUser) },
      externalIdentity: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (transaction: any) => unknown) => callback(tx)),
    };
    google = { verify: jest.fn().mockResolvedValue({ sub: 'google-subject-1', email: 'PLAYER@example.test', email_verified: true }) };
    service = new AccountIdentityService(prisma as PrismaService, google as GoogleIdentityVerifier);
  });

  it('requires a registered account', async () => {
    await expect(service.linkGoogle(
      { principalType: PrincipalType.GUEST, principalId: 'guest-1', sessionId: 'guest-session' },
      'google-id-token',
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(google.verify).not.toHaveBeenCalled();
  });

  it('requires a verified matching account email', async () => {
    prisma.user.findFirst.mockResolvedValue({ ...verifiedUser, emailVerifiedAt: null });
    await expect(service.linkGoogle(principal, 'google-id-token')).rejects.toBeInstanceOf(ForbiddenException);
    prisma.user.findFirst.mockResolvedValue({ ...verifiedUser, email: 'different@example.test' });
    await expect(service.linkGoogle(principal, 'google-id-token')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('links a verified Google identity only after explicit authenticated action', async () => {
    await expect(service.linkGoogle(principal, 'google-id-token')).resolves.toEqual({
      linked: true, alreadyLinked: false, provider: 'GOOGLE',
    });
    expect(tx.externalIdentity.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1', provider: 'GOOGLE', providerSubject: 'google-subject-1',
        providerEmail: 'player@example.test', emailVerified: true,
      },
    });
    expect(tx.identityAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: 'GOOGLE_IDENTITY_LINKED', principalId: 'user-1', sessionId: 'session-1' }),
    }));
  });

  it('is idempotent when the same Google identity is already linked to this user', async () => {
    prisma.externalIdentity.findUnique.mockResolvedValue({ id: 'identity-1', userId: 'user-1' });
    await expect(service.linkGoogle(principal, 'google-id-token')).resolves.toMatchObject({ linked: true, alreadyLinked: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a Google identity linked to another user', async () => {
    prisma.externalIdentity.findUnique.mockResolvedValue({ id: 'identity-1', userId: 'another-user' });
    await expect(service.linkGoogle(principal, 'google-id-token')).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not link a second Google identity to one account', async () => {
    prisma.externalIdentity.findFirst.mockResolvedValue({ id: 'existing-google' });
    await expect(service.linkGoogle(principal, 'google-id-token')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
