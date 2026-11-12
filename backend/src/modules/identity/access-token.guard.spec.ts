import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GuestIdentityStatus, PrincipalType, UserStatus } from '@prisma/client';
import { AccessTokenGuard } from './access-token.guard';

describe('AccessTokenGuard', () => {
  const now = new Date();
  const session = {
    id: 'session-1',
    userId: 'user-1',
    guestIdentityId: null,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
    user: { status: UserStatus.ACTIVE },
    guestIdentity: null,
  };
  const prisma = {
    userSession: { findUnique: jest.fn() },
  };
  const accessTokens = { verify: jest.fn() };
  const guard = new AccessTokenGuard(accessTokens as never, prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.userSession.findUnique.mockResolvedValue(session);
    accessTokens.verify.mockReturnValue({
      sid: 'session-1',
      sub: 'user-1',
      principalType: PrincipalType.USER,
    });
  });

  it('attaches a verified registered-user principal to the request', async () => {
    const request = { headers: { authorization: 'Bearer valid-token' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request).toHaveProperty('principal', {
      principalType: PrincipalType.USER,
      principalId: 'user-1',
      sessionId: 'session-1',
    });
  });

  it('rejects missing or non-Bearer authorization headers', async () => {
    for (const authorization of [undefined, 'Basic token', 'bearer token']) {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: { authorization } }),
        }),
      } as ExecutionContext;
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(accessTokens.verify).not.toHaveBeenCalled();
  });

  it('rejects missing, revoked, or expired sessions', async () => {
    const invalidSessions = [
      null,
      { ...session, revokedAt: now },
      { ...session, expiresAt: new Date(now.getTime() - 1) },
    ];
    for (const invalidSession of invalidSessions) {
      prisma.userSession.findUnique.mockResolvedValueOnce(invalidSession);
      await expect(guard.authenticate('token')).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it('rejects a registered-user token when the session owner or account status does not match', async () => {
    prisma.userSession.findUnique.mockResolvedValueOnce({ ...session, userId: 'another-user' });
    await expect(guard.authenticate('token')).rejects.toBeInstanceOf(UnauthorizedException);

    prisma.userSession.findUnique.mockResolvedValueOnce({
      ...session,
      user: { status: UserStatus.SUSPENDED },
    });
    await expect(guard.authenticate('token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts an active guest only when the guest session owner matches', async () => {
    accessTokens.verify.mockReturnValue({
      sid: 'session-guest',
      sub: 'guest-1',
      principalType: PrincipalType.GUEST,
    });
    prisma.userSession.findUnique.mockResolvedValueOnce({
      ...session,
      id: 'session-guest',
      userId: null,
      guestIdentityId: 'guest-1',
      user: null,
      guestIdentity: { status: GuestIdentityStatus.ACTIVE },
    });

    await expect(guard.authenticate('guest-token')).resolves.toEqual({
      principalType: PrincipalType.GUEST,
      principalId: 'guest-1',
      sessionId: 'session-guest',
    });
  });

  it('rejects converted or revoked guest identities', async () => {
    accessTokens.verify.mockReturnValue({
      sid: 'session-guest',
      sub: 'guest-1',
      principalType: PrincipalType.GUEST,
    });
    for (const status of [GuestIdentityStatus.CONVERTED, GuestIdentityStatus.REVOKED]) {
      prisma.userSession.findUnique.mockResolvedValueOnce({
        ...session,
        id: 'session-guest',
        userId: null,
        guestIdentityId: 'guest-1',
        user: null,
        guestIdentity: { status },
      });
      await expect(guard.authenticate('guest-token')).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });
});
