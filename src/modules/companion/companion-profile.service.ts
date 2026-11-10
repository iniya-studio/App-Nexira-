import { Injectable } from '@nestjs/common';
import { PrincipalType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';

@Injectable()
export class CompanionProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(principal: AuthenticatedPrincipal) {
    const profile = principal.principalType === PrincipalType.USER
      ? await this.prisma.companionProfile.upsert({
          where: { userId: principal.principalId },
          create: { userId: principal.principalId },
          update: {},
          select: { id: true, activeCharacterStoreItemId: true },
        })
      : await this.prisma.companionProfile.upsert({
          where: { guestIdentityId: principal.principalId },
          create: { guestIdentityId: principal.principalId },
          update: {},
          select: { id: true, activeCharacterStoreItemId: true },
        });

    return {
      id: profile.id,
      appearance: profile.activeCharacterStoreItemId
        ? { type: 'STORE_AVATAR', storeItemId: profile.activeCharacterStoreItemId }
        : { type: 'DEFAULT' },
    };
  }
}
