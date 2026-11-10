import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrincipalType, Prisma, StoreItemType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';

@Injectable()
export class CompanionProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(principal: AuthenticatedPrincipal) {
    const profile =
      principal.principalType === PrincipalType.USER
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

    return this.toProfileResponse(profile);
  }

  async equipAppearance(principal: AuthenticatedPrincipal, storeItemId: string) {
    this.assertRegisteredUser(principal);
    await this.getOrCreate(principal);

    const profile = await this.prisma.$transaction(
      async (tx) => {
        const item = await tx.storeItem.findFirst({
          where: {
            id: storeItemId,
            itemType: StoreItemType.AVATAR,
            isActive: true,
          },
          select: { id: true },
        });
        if (!item) throw new NotFoundException('Avatar item is unavailable');

        const ownership = await tx.userInventory.findFirst({
          where: {
            userId: principal.principalId,
            storeItemId,
            revokedAt: null,
          },
          select: { id: true },
        });
        if (!ownership) throw new ForbiddenException('Avatar is not owned by this user');

        return tx.companionProfile.update({
          where: { userId: principal.principalId },
          data: { activeCharacterStoreItemId: item.id },
          select: { id: true, activeCharacterStoreItemId: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.toProfileResponse(profile);
  }

  async unequipAppearance(principal: AuthenticatedPrincipal) {
    this.assertRegisteredUser(principal);
    await this.getOrCreate(principal);

    const profile = await this.prisma.companionProfile.update({
      where: { userId: principal.principalId },
      data: { activeCharacterStoreItemId: null },
      select: { id: true, activeCharacterStoreItemId: true },
    });

    return this.toProfileResponse(profile);
  }

  private assertRegisteredUser(principal: AuthenticatedPrincipal) {
    if (principal.principalType !== PrincipalType.USER) {
      throw new ForbiddenException('Guest users cannot equip Store avatars');
    }
  }

  private toProfileResponse(profile: {
    id: string;
    activeCharacterStoreItemId: string | null;
  }) {
    return {
      id: profile.id,
      appearance: profile.activeCharacterStoreItemId
        ? { type: 'STORE_AVATAR', storeItemId: profile.activeCharacterStoreItemId }
        : { type: 'DEFAULT' },
    };
  }
}
