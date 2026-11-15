import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrincipalType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenService } from '../identity/access-token.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { SessionService } from './session.service';

describe('SessionService account controls', () => {
  const user: AuthenticatedPrincipal = { principalType: PrincipalType.USER, principalId: 'user-1', sessionId: 'current-session' };
  const guest: AuthenticatedPrincipal = { principalType: PrincipalType.GUEST, principalId: 'guest-1', sessionId: 'guest-session' };
  const tx = {
    userSession: { findMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    identityAuditEvent: { create: jest.fn() },
  };
  const prisma = {
    userSession: { findMany: jest.fn() },
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
  };
  let service: SessionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionService(prisma as unknown as PrismaService, {} as never, {} as unknown as AccessTokenService);
    tx.userSession.findMany.mockResolvedValue([]);
    tx.userSession.findFirst.mockResolvedValue({ id: 'other-session' });
    tx.userSession.updateMany.mockResolvedValue({ count: 1 });
    tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tx.identityAuditEvent.create.mockResolvedValue({});
  });

  it('lists only the authenticated user sessions and marks the current one', async () => {
    const createdAt = new Date('2026-11-01T00:00:00.000Z');
    const expiresAt = new Date('2027-01-01T00:00:00.000Z');
    prisma.userSession.findMany.mockResolvedValue([
      { id: 'current-session', createdAt, expiresAt, revokedAt: null },
    ]);
    await expect(service.listSessions(user)).resolves.toEqual({
      sessions: [{
        sessionId: 'current-session', createdAt, expiresAt, revokedAt: null, isCurrent: true, status: 'ACTIVE',
      }],
    });
    expect(prisma.userSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-1' }),
    }));
  });

  it('does not allow guests to enumerate sessions', async () => {
    await expect(service.listSessions(guest)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.userSession.findMany).not.toHaveBeenCalled();
  });

  it('revokes all owned sessions and their refresh credentials atomically', async () => {
    tx.userSession.findMany.mockResolvedValue([{ id: 'current-session' }, { id: 'session-2' }]);
    await expect(service.logoutAll(user)).resolves.toEqual({ success: true, revokedSessions: 1 });
    expect(tx.userSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', revokedAt: null },
    }));
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { sessionId: { in: ['current-session', 'session-2'] }, revokedAt: null },
    }));
    expect(tx.identityAuditEvent.create).toHaveBeenCalled();
  });

  it('revokes only a session owned by the authenticated user', async () => {
    await expect(service.revokeSession(user, 'other-session')).resolves.toEqual({ success: true, revoked: true });
    expect(tx.userSession.findFirst).toHaveBeenCalledWith({
      where: { id: 'other-session', userId: 'user-1' },
      select: { id: true },
    });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { sessionId: 'other-session', revokedAt: null },
    }));
  });

  it('does not reveal or revoke another account session', async () => {
    tx.userSession.findFirst.mockResolvedValue(null);
    await expect(service.revokeSession(user, 'foreign-session')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.userSession.updateMany).not.toHaveBeenCalled();
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
