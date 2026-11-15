import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrincipalType, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyAccount(principal: AuthenticatedPrincipal) {
    if (principal.principalType !== PrincipalType.USER) {
      throw new ForbiddenException('A registered account is required');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: principal.principalId, status: UserStatus.ACTIVE },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        preferredLanguage: true,
        status: true,
        createdAt: true,
        emailVerifiedAt: true,
        credential: { select: { id: true } },
        externalIdentities: { select: { provider: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!user) throw new NotFoundException('Account not found');
    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        preferredLanguage: user.preferredLanguage,
        status: user.status,
        createdAt: user.createdAt,
        emailVerifiedAt: user.emailVerifiedAt,
      },
      authentication: {
        passwordEnabled: user.credential !== null,
        providers: user.externalIdentities.map((identity) => identity.provider),
      },
      emailVerification: {
        required: Boolean(user.email && !user.emailVerifiedAt),
        verified: Boolean(user.emailVerifiedAt),
      },
    };
  }
}
