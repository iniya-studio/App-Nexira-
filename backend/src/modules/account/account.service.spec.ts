import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrincipalType, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { AccountService } from './account.service';

describe('AccountService', () => {
  const user: AuthenticatedPrincipal = { principalType: PrincipalType.USER, principalId: 'user-1', sessionId: 's1' };
  const guest: AuthenticatedPrincipal = { principalType: PrincipalType.GUEST, principalId: 'guest-1', sessionId: 's2' };
  const prisma = { user: { findFirst: jest.fn() } };
  let service: AccountService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AccountService(prisma as unknown as PrismaService);
  });

  it('returns only safe account and authentication metadata', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'player@example.com',
      username: 'player_1',
      displayName: 'Player One',
      preferredLanguage: 'en',
      status: UserStatus.ACTIVE,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      emailVerifiedAt: null,
      credential: { id: 'credential-1', passwordHash: 'must-not-leak' },
      externalIdentities: [{ provider: 'GOOGLE', providerSubject: 'must-not-leak' }],
    });
    const result = await service.getMyAccount(user);
    expect(result.authentication).toEqual({ passwordEnabled: true, providers: ['GOOGLE'] });
    expect(result.emailVerification).toEqual({ required: true, verified: false });
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(JSON.stringify(result)).not.toContain('providerSubject');
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: user.principalId, status: UserStatus.ACTIVE },
    }));
  });

  it('rejects guest principals from the private account endpoint', async () => {
    await expect(service.getMyAccount(guest)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('does not return suspended or missing accounts', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.getMyAccount(user)).rejects.toBeInstanceOf(NotFoundException);
  });
});
