import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IdentityProvider, PrincipalType, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { GoogleIdentityVerifier } from '../auth/google-identity-verifier';

@Injectable()
export class AccountIdentityService {
  constructor(private readonly prisma: PrismaService, private readonly google: GoogleIdentityVerifier) {}

  async linkGoogle(principal: AuthenticatedPrincipal, idToken: string, nonce: string) {
    if (principal.principalType !== PrincipalType.USER) {
      throw new ForbiddenException('Registered account required');
    }
    const claims = await this.google.verify(idToken, nonce);
    const providerEmail = claims.email!.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { id: principal.principalId, status: UserStatus.ACTIVE },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (!user) throw new NotFoundException('Account not found');
    if (!user.email || !user.emailVerifiedAt || user.email.trim().toLowerCase() !== providerEmail) {
      throw new ForbiddenException('Verify your account email and use a Google identity with the same verified email');
    }

    const existing = await this.prisma.externalIdentity.findUnique({
      where: { provider_providerSubject: { provider: IdentityProvider.GOOGLE, providerSubject: claims.sub! } },
      select: { id: true, userId: true },
    });
    if (existing) {
      if (existing.userId === user.id) return { linked: true, alreadyLinked: true, provider: IdentityProvider.GOOGLE };
      throw new ConflictException('This Google identity is linked to another account');
    }
    const accountProvider = await this.prisma.externalIdentity.findFirst({
      where: { userId: user.id, provider: IdentityProvider.GOOGLE },
      select: { id: true },
    });
    if (accountProvider) throw new ConflictException('A Google identity is already linked to this account');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const currentUser = await tx.user.findFirst({
          where: { id: user.id, status: UserStatus.ACTIVE, emailVerifiedAt: { not: null } },
          select: { id: true, email: true },
        });
        if (!currentUser || currentUser.email?.trim().toLowerCase() !== providerEmail) {
          throw new ForbiddenException('Account email verification is required');
        }
        const linked = await tx.externalIdentity.findUnique({
          where: { provider_providerSubject: { provider: IdentityProvider.GOOGLE, providerSubject: claims.sub! } },
          select: { id: true, userId: true },
        });
        if (linked) {
          if (linked.userId === user.id) return { linked: true, alreadyLinked: true, provider: IdentityProvider.GOOGLE };
          throw new ConflictException('This Google identity is linked to another account');
        }
        const existingForAccount = await tx.externalIdentity.findFirst({
          where: { userId: user.id, provider: IdentityProvider.GOOGLE },
          select: { id: true },
        });
        if (existingForAccount) throw new ConflictException('A Google identity is already linked to this account');
        await tx.externalIdentity.create({
          data: {
            userId: user.id,
            provider: IdentityProvider.GOOGLE,
            providerSubject: claims.sub!,
            providerEmail,
            emailVerified: true,
          },
        });
        await tx.identityAuditEvent.create({
          data: {
            eventType: 'GOOGLE_IDENTITY_LINKED',
            principalType: PrincipalType.USER,
            principalId: user.id,
            sessionId: principal.sessionId,
            result: 'SUCCESS',
          },
        });
        return { linked: true, alreadyLinked: false, provider: IdentityProvider.GOOGLE };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('This Google identity is already linked');
      }
      throw error;
    }
  }
}
