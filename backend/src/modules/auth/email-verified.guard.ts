import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrincipalType, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';

type PrincipalRequest = { principal?: AuthenticatedPrincipal };

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PrincipalRequest>();
    const principal = request.principal;
    if (!principal) throw new UnauthorizedException('Authentication is required');

    // Guest play remains available; email verification applies to registered accounts.
    if (principal.principalType === PrincipalType.GUEST) return true;

    const user = await this.prisma.user.findUnique({
      where: { id: principal.principalId },
      select: { status: true, emailVerifiedAt: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('This account cannot perform this action');
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Email verification is required for this action');
    }
    return true;
  }
}