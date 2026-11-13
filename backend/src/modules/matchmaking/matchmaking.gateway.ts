import { UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { WsAccessTokenGuard } from '../identity/ws-access-token.guard';

@WebSocketGateway({ namespace: '/matchmaking' })
export class MatchmakingGateway {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(WsAccessTokenGuard)
  @SubscribeMessage('matchmaking.subscribe')
  async subscribe(@ConnectedSocket() client: Socket) {
    const principal = client.data.principal as AuthenticatedPrincipal | undefined;
    if (!principal || !(await this.isSessionActive(principal))) {
      client.disconnect(true);
      return { subscribed: false };
    }
    await client.join(this.principalRoom(principal));
    return { subscribed: true };
  }

  @UseGuards(WsAccessTokenGuard)
  @SubscribeMessage('matchmaking.unsubscribe')
  async unsubscribe(@ConnectedSocket() client: Socket) {
    const principal = client.data.principal as AuthenticatedPrincipal | undefined;
    if (!principal) return { subscribed: false };
    await client.leave(this.principalRoom(principal));
    return { subscribed: false };
  }
  async notifyMatchFound(
    principals: AuthenticatedPrincipal[],
    payload: { matchId: string; match: unknown },
  ) {
    if (!this.server) return;
    for (const principal of principals) {
      const sockets = await this.server.in(this.principalRoom(principal)).fetchSockets();
      for (const socket of sockets) {
        const connectedPrincipal = socket.data.principal as AuthenticatedPrincipal | undefined;
        if (connectedPrincipal && await this.isSessionActive(connectedPrincipal)) {
          socket.emit('matchmaking.match.found', payload);
        } else {
          socket.disconnect(true);
        }
      }
    }
  }

  private principalRoom(principal: AuthenticatedPrincipal) {
    return `principal:${principal.principalType.toLowerCase()}:${principal.principalId}`;
  }

  private async isSessionActive(principal: AuthenticatedPrincipal) {
    const session = await this.prisma.userSession.findUnique({
      where: { id: principal.sessionId },
      select: {
        userId: true,
        guestIdentityId: true,
        expiresAt: true,
        revokedAt: true,
        user: { select: { status: true } },
        guestIdentity: { select: { status: true } },
      },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) return false;
    return principal.principalType === 'USER'
      ? session.userId === principal.principalId && session.guestIdentityId === null && session.user?.status === 'ACTIVE'
      : session.guestIdentityId === principal.principalId && session.userId === null && session.guestIdentity?.status === 'ACTIVE';
  }
}