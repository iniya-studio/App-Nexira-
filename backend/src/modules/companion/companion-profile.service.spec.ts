import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CompanionProfileService } from './companion-profile.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('CompanionProfileService', () => {
  const profile = { id: 'companion-1', activeCharacterStoreItemId: null };
  const companionProfile = {
    upsert: jest.fn().mockResolvedValue(profile),
    update: jest.fn().mockResolvedValue(profile),
  };
  const tx = {
    storeItem: { findFirst: jest.fn() },
    userInventory: { findFirst: jest.fn() },
    companionProfile: { update: jest.fn() },
  };
  const prisma = {
    companionProfile,
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  const service = new CompanionProfileService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    companionProfile.upsert.mockResolvedValue(profile);
    companionProfile.update.mockResolvedValue(profile);
    tx.storeItem.findFirst.mockResolvedValue({ id: 'avatar-item-1' });
    tx.userInventory.findFirst.mockResolvedValue({ id: 'inventory-1' });
    tx.companionProfile.update.mockResolvedValue({
      id: 'companion-1',
      activeCharacterStoreItemId: 'avatar-item-1',
    });
  });

  it('creates or returns the single profile for a registered user', async () => {
    await expect(service.getOrCreate({
      principalType: 'USER',
      principalId: 'user-1',
      sessionId: 'session-1',
    })).resolves.toEqual({ id: 'companion-1', appearance: { type: 'DEFAULT' } });

    expect(companionProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1' },
      update: {},
      select: { id: true, activeCharacterStoreItemId: true },
    });
  });

  it('creates or returns the single profile for a guest identity', async () => {
    await service.getOrCreate({
      principalType: 'GUEST',
      principalId: 'guest-1',
      sessionId: 'session-2',
    });

    expect(companionProfile.upsert).toHaveBeenCalledWith({
      where: { guestIdentityId: 'guest-1' },
      create: { guestIdentityId: 'guest-1' },
      update: {},
      select: { id: true, activeCharacterStoreItemId: true },
    });
  });

  it('returns the equipped appearance without creating a new companion identity', async () => {
    companionProfile.upsert.mockResolvedValueOnce({
      id: 'companion-2',
      activeCharacterStoreItemId: 'avatar-item-1',
    });

    await expect(service.getOrCreate({
      principalType: 'USER',
      principalId: 'user-2',
      sessionId: 'session-3',
    })).resolves.toEqual({
      id: 'companion-2',
      appearance: { type: 'STORE_AVATAR', storeItemId: 'avatar-item-1' },
    });
  });

  it('equips an active avatar only when the user owns it', async () => {
    await expect(service.equipAppearance({
      principalType: 'USER',
      principalId: 'user-1',
      sessionId: 'session-1',
    }, 'avatar-item-1')).resolves.toEqual({
      id: 'companion-1',
      appearance: { type: 'STORE_AVATAR', storeItemId: 'avatar-item-1' },
    });

    expect(tx.userInventory.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', storeItemId: 'avatar-item-1', revokedAt: null },
      select: { id: true },
    });
  });

  it('rejects unavailable or non-avatar catalog items', async () => {
    tx.storeItem.findFirst.mockResolvedValueOnce(null);

    await expect(service.equipAppearance({
      principalType: 'USER',
      principalId: 'user-1',
      sessionId: 'session-1',
    }, 'avatar-item-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects avatars without an active ownership grant', async () => {
    tx.userInventory.findFirst.mockResolvedValueOnce(null);

    await expect(service.equipAppearance({
      principalType: 'USER',
      principalId: 'user-1',
      sessionId: 'session-1',
    }, 'avatar-item-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not allow guests to equip Store avatars', async () => {
    await expect(service.equipAppearance({
      principalType: 'GUEST',
      principalId: 'guest-1',
      sessionId: 'session-1',
    }, 'avatar-item-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('restores the default appearance without changing inventory', async () => {
    await expect(service.unequipAppearance({
      principalType: 'USER',
      principalId: 'user-1',
      sessionId: 'session-1',
    })).resolves.toEqual({ id: 'companion-1', appearance: { type: 'DEFAULT' } });

    expect(companionProfile.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { activeCharacterStoreItemId: null },
      select: { id: true, activeCharacterStoreItemId: true },
    });
  });
});
