import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenService } from './access-token.service';
import { AuthenticatedPrincipal } from './authenticated-principal';

type AuthenticatedRequest = {
  headers: { authorization?: string };
  principal?: AuthenticatedPrincipal;
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException();
    request.principal = await this.authenticate(authorization.slice(7));
    return true;
  }

  async authenticate(token: string): Promise<AuthenticatedPrincipal> {
    const claims = this.accessTokens.verify(token);
    const session = await this.prisma.userSession.findUnique({
      where: { id: claims.sid },
      include: { user: true, guestIdentity: true },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now) throw new UnauthorizedException();
    const ownerMatches =
      claims.principalType === 'USER'
        ? session.userId === claims.sub && session.guestIdentityId === null && session.user?.status === 'ACTIVE'
        : session.guestIdentityId === claims.sub && session.userId === null && session.guestIdentity?.status === 'ACTIVE';
    if (!ownerMatches) throw new UnauthorizedException();
    return {
      principalType: claims.principalType,
      principalId: claims.sub,
      sessionId: claims.sid,
    };
  }
}
