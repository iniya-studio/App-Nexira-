import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrincipalType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailVerifiedGuard } from './email-verified.guard';

describe('EmailVerifiedGuard', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
  };
  const guard = new EmailVerifiedGuard(prisma as unknown as PrismaService);
  const context = (principal?: { principalType: PrincipalType; principalId: string }) => ({
    switchToHttp: () => ({
      getRequest: () => ({ principal }),
    }),
  }) as never;

  beforeEach(() => jest.clearAllMocks());

  it('requires an authenticated principal', async () => {
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows guest play without email verification', async () => {
    await expect(guard.canActivate(context({
      principalType: PrincipalType.GUEST,
      principalId: 'guest-1',
    }))).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('blocks an unverified registered account from protected actions', async () => {
    prisma.user.findUnique.mockResolvedValue({ status: 'ACTIVE', emailVerifiedAt: null });
    await expect(guard.canActivate(context({
      principalType: PrincipalType.USER,
      principalId: 'user-1',
    }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a verified active registered account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    });
    await expect(guard.canActivate(context({
      principalType: PrincipalType.USER,
      principalId: 'user-1',
    }))).resolves.toBe(true);
  });
});