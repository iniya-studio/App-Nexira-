import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AccessTokenGuard } from './access-token.guard';

@Injectable()
export class WsAccessTokenGuard implements CanActivate {
  constructor(private readonly accessGuard: AccessTokenGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const authToken = client.handshake.auth?.accessToken;
    const authorization = client.handshake.headers.authorization;
    const token = typeof authToken === 'string'
      ? authToken
      : typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : null;
    if (!token) throw new WsException('Unauthorized');
    try {
      client.data.principal = await this.accessGuard.authenticate(token);
      return true;
    } catch {
      throw new WsException('Unauthorized');
    }
  }
}
