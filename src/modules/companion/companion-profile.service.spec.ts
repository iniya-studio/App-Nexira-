import { CompanionProfileService } from './companion-profile.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('CompanionProfileService', () => {
  const profile = { id: 'companion-1', activeCharacterStoreItemId: null };
  const companionProfile = { upsert: jest.fn().mockResolvedValue(profile) };
  const prisma = { companionProfile } as unknown as PrismaService;
  const service = new CompanionProfileService(prisma);

  beforeEach(() => companionProfile.upsert.mockClear());

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
});
