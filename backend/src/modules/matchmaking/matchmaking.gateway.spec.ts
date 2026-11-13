import { PrincipalType } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { MatchmakingGateway } from './matchmaking.gateway';

describe('MatchmakingGateway', () => {
  const principal: AuthenticatedPrincipal = {
    principalType: PrincipalType.GUEST, principalId: 'guest-1', sessionId: 'session-1',
  };

  function setup(sessionOverrides: Record<string, unknown> = {}) {
    const prisma = {
      userSession: { findUnique: jest.fn().mockResolvedValue({
        userId: null, guestIdentityId: 'guest-1',
        expiresAt: new Date(Date.now() + 60_000), revokedAt: null,
        user: null, guestIdentity: { status: 'ACTIVE' },
        ...sessionOverrides,
      }) },
    } as unknown as PrismaService;
    const gateway = new MatchmakingGateway(prisma);
    return { gateway, prisma };
  }


  it('leaves only the authenticated principal room on unsubscribe', async () => {
    const { gateway } = setup();
    const client = { data: { principal }, leave: jest.fn().mockResolvedValue(undefined) } as unknown as Socket;
    await expect(gateway.unsubscribe(client)).resolves.toEqual({ subscribed: false });
    expect(client.leave).toHaveBeenCalledWith('principal:guest:guest-1');
  });
  it('emits match-found only to an authenticated active principal room', async () => {
    const { gateway, prisma } = setup();
    const socket = { data: { principal }, emit: jest.fn(), disconnect: jest.fn() };
    const fetchSockets = jest.fn().mockResolvedValue([socket]);
    const server = { in: jest.fn().mockReturnValue({ fetchSockets }) };
    gateway.server = server as unknown as Server;
    await gateway.notifyMatchFound([principal], { matchId: 'match-1', match: { status: 'WAITING' } });
    expect(server.in).toHaveBeenCalledWith('principal:guest:guest-1');
    expect(socket.emit).toHaveBeenCalledWith('matchmaking.match.found', { matchId: 'match-1', match: { status: 'WAITING' } });
    expect(prisma.userSession.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'session-1' } }));
  });

  it('disconnects a socket whose session has been revoked before notification', async () => {
    const { gateway } = setup({ revokedAt: new Date() });
    const socket = { data: { principal }, emit: jest.fn(), disconnect: jest.fn() };
    gateway.server = { in: () => ({ fetchSockets: async () => [socket] }) } as unknown as Server;
    await gateway.notifyMatchFound([principal], { matchId: 'match-2', match: {} });
    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('joins only the server-derived principal room after guarded authentication', async () => {
    const { gateway } = setup();
    const client = { data: { principal }, join: jest.fn().mockResolvedValue(undefined), disconnect: jest.fn() } as unknown as Socket;
    await expect(gateway.subscribe(client)).resolves.toEqual({ subscribed: true });
    expect(client.join).toHaveBeenCalledWith('principal:guest:guest-1');
  });
});