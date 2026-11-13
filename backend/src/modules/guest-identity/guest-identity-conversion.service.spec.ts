import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuestIdentityStatus, PrincipalType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../session/session.service';
import { EmailVerificationService } from '../auth/email-verification.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { GuestIdentityService } from './guest-identity.service';

describe('GuestIdentityService conversion', () => {
  const principal: AuthenticatedPrincipal = {
    principalType: PrincipalType.GUEST,
    principalId: 'guest-1',
    sessionId: 'guest-session-1',
  };
  const sessionResponse = {
    principal: { principalType: PrincipalType.USER, principalId: 'user-1' },
    session: { sessionId: 'user-session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
    tokens: {
      accessToken: 'access-token',
      accessTokenExpiresAt: '2029-01-01T00:15:00.000Z',
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z',
    },
  };

  let service: GuestIdentityService;
  let tx: {
    guestIdentity: { findUnique: jest.Mock; updateMany: jest.Mock };
    guestProgress: { findUnique: jest.Mock; update: jest.Mock };
    guestXPTransaction: { findMany: jest.Mock };
    userProgress: { create: jest.Mock };
    xPTransaction: { create: jest.Mock };
    $queryRaw: jest.Mock;
    $queryRawUnsafe: jest.Mock;
    user: { create: jest.Mock };
    companionProfile: { updateMany: jest.Mock };
    matchmakingEntry: { updateMany: jest.Mock; findMany: jest.Mock };
    matchParticipant: { updateMany: jest.Mock };
    userSession: { updateMany: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    identityAuditEvent: { create: jest.Mock };
  };
  let sessions: { createSessionInTransaction: jest.Mock };
  let emailVerification: { issueAndSend: jest.Mock };
  let prisma: { $transaction: jest.Mock };

  beforeEach(() => {
    tx = {
      guestIdentity: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'guest-1', status: GuestIdentityStatus.ACTIVE, convertedToUserId: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      guestProgress: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      guestXPTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      userProgress: { create: jest.fn().mockResolvedValue({}) },
      xPTransaction: { create: jest.fn().mockResolvedValue({}) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'guest-1' }]),
      user: {
        create: jest.fn().mockResolvedValue({
          id: 'user-1', email: 'player@example.com', username: 'player_one',
          displayName: 'Player One', preferredLanguage: 'en', emailVerifiedAt: null,
        }),
      },
      companionProfile: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      matchmakingEntry: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      matchParticipant: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userSession: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      identityAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    sessions = { createSessionInTransaction: jest.fn().mockResolvedValue(sessionResponse) };
    emailVerification = { issueAndSend: jest.fn().mockResolvedValue('SENT') };
    const config = {
      get: jest.fn((key: string) => ({
        ARGON2_MEMORY_COST_KIB: '1024',
        ARGON2_TIME_COST: '2',
        ARGON2_PARALLELISM: '1',
      })[key]),
    };
    service = new GuestIdentityService(
      prisma as unknown as PrismaService,
      sessions as unknown as SessionService,
      config as unknown as ConfigService,
      emailVerification as unknown as EmailVerificationService,
    );
  });

  const input = {
    email: ' Player@Example.com ',
    password: 'a-long-and-strong-password',
    username: 'Player_One',
    displayName: ' Player One ',
  };

  it('transfers the existing Companion profile and creates a fresh USER session atomically', async () => {
    const result = await service.convert(principal, input);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT "id" FROM "GuestIdentity" WHERE "id" = $1::uuid FOR UPDATE',
      'guest-1',
    );
    expect(tx.companionProfile.updateMany).toHaveBeenCalledWith({
      where: { guestIdentityId: 'guest-1', userId: null },
      data: { guestIdentityId: null, userId: 'user-1' },
    });
    expect(tx.matchmakingEntry.updateMany).toHaveBeenCalledWith({
      where: { guestIdentityId: 'guest-1', status: 'WAITING' },
      data: { guestIdentityId: null, userId: 'user-1' },
    });
    expect(tx.matchmakingEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ guestIdentityId: 'guest-1', status: 'MATCHED' }),
    }));
    expect(tx.guestIdentity.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'guest-1', status: GuestIdentityStatus.ACTIVE, convertedToUserId: null },
      data: expect.objectContaining({
        status: GuestIdentityStatus.CONVERTED,
        convertedToUserId: 'user-1',
        convertedAt: expect.any(Date),
      }),
    }));
    expect(tx.userSession.updateMany).toHaveBeenCalled();
    expect(tx.refreshToken.updateMany).toHaveBeenCalled();
    expect(sessions.createSessionInTransaction).toHaveBeenCalledWith(tx, {
      principalType: PrincipalType.USER, principalId: 'user-1',
    });
    expect(emailVerification.issueAndSend).toHaveBeenCalledWith('user-1');
    expect(result.emailVerification).toEqual({ required: true, verified: false, delivery: 'SENT' });
  });


  it('transfers guest XP snapshot and immutable ledger entries into the new user atomically', async () => {
    const createdAt = new Date('2026-11-13T10:00:00.000Z');
    tx.guestProgress.findUnique.mockResolvedValue({
      guestIdentityId: 'guest-1',
      level: 3,
      currentLevelXp: 25,
      totalXp: BigInt(325),
      transferredAt: null,
    });
    tx.guestXPTransaction.findMany.mockResolvedValue([
      { id: 'guest-xp-1', matchId: 'match-1', amount: 12, reason: 'MATCH_REWARD', createdAt },
      { id: 'guest-xp-2', matchId: 'match-2', amount: 8, reason: 'MATCH_REWARD', createdAt },
    ]);

    await service.convert(principal, input);

    expect(tx.userProgress.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        level: 3,
        currentLevelXp: 25,
        totalXp: BigInt(325),
      },
    });
    expect(tx.xPTransaction.create).toHaveBeenNthCalledWith(1, {
      data: {
        userId: 'user-1',
        matchId: 'match-1',
        amount: 12,
        reason: 'GUEST_CONVERSION_TRANSFER',
        idempotencyKey: 'guest-conversion:guest-1:xp:guest-xp-1:v1',
      },
    });
    expect(tx.xPTransaction.create).toHaveBeenNthCalledWith(2, {
      data: {
        userId: 'user-1',
        matchId: 'match-2',
        amount: 8,
        reason: 'GUEST_CONVERSION_TRANSFER',
        idempotencyKey: 'guest-conversion:guest-1:xp:guest-xp-2:v1',
      },
    });
    expect(tx.guestProgress.update).toHaveBeenCalledWith({
      where: { guestIdentityId: 'guest-1' },
      data: { transferredAt: expect.any(Date) },
    });
  });


  it('transfers an already-paired active 1v1 match to the newly created account', async () => {
    tx.matchmakingEntry.findMany
      .mockResolvedValueOnce([{ category: 'general', language: 'en' }])
      .mockResolvedValueOnce([{ matchId: 'match-1' }])
      .mockResolvedValueOnce([{ id: 'queue-1', matchId: 'match-1' }]);
    tx.matchParticipant.updateMany.mockResolvedValue({ count: 1 });
    tx.matchmakingEntry.updateMany.mockResolvedValue({ count: 1 });

    await service.convert(principal, input);

    expect(tx.matchParticipant.updateMany).toHaveBeenCalledWith({
      where: { guestIdentityId: 'guest-1', matchId: { in: ['match-1'] } },
      data: { guestIdentityId: null, userId: 'user-1' },
    });
    expect(tx.matchmakingEntry.updateMany).toHaveBeenLastCalledWith({
      where: { id: { in: ['queue-1'] }, guestIdentityId: 'guest-1', status: 'MATCHED' },
      data: { guestIdentityId: null, userId: 'user-1' },
    });
  });

  it('rejects conversion from a registered USER principal', async () => {
    await expect(service.convert({
      principalType: PrincipalType.USER, principalId: 'user-1', sessionId: 's1',
    }, input)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an already converted or inactive guest without creating a user', async () => {
    tx.guestIdentity.findUnique.mockResolvedValue({
      id: 'guest-1', status: GuestIdentityStatus.CONVERTED, convertedToUserId: 'user-1',
    });
    await expect(service.convert(principal, input)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(sessions.createSessionInTransaction).not.toHaveBeenCalled();
  });

  it('rolls back if a concurrent conversion wins the conditional guest update', async () => {
    tx.guestIdentity.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.convert(principal, input)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.createSessionInTransaction).not.toHaveBeenCalled();
  });

  it('does not silently link an existing email or username', async () => {
    prisma.$transaction.mockRejectedValue({ code: 'P2002' });
    await expect(service.convert(principal, input)).rejects.toThrow(
      'An account with this email or username already exists',
    );
    expect(emailVerification.issueAndSend).not.toHaveBeenCalled();
  });
});
