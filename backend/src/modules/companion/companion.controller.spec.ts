import { CompanionController } from './companion.controller';
import { CompanionProfileService } from './companion-profile.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';

describe('CompanionController', () => {
  const profiles = {
    getOrCreate: jest.fn(),
    equipAppearance: jest.fn(),
    unequipAppearance: jest.fn(),
  };
  const controller = new CompanionController(profiles as unknown as CompanionProfileService);
  const userPrincipal: AuthenticatedPrincipal = {
    principalType: 'USER',
    principalId: 'user-1',
    sessionId: 'session-1',
  };
  const guestPrincipal: AuthenticatedPrincipal = {
    principalType: 'GUEST',
    principalId: 'guest-1',
    sessionId: 'session-2',
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns the profile for the authenticated principal', async () => {
    const expected = { id: 'companion-1', appearance: { type: 'DEFAULT' } };
    profiles.getOrCreate.mockResolvedValue(expected);

    await expect(controller.getProfile({ principal: guestPrincipal })).resolves.toBe(expected);
    expect(profiles.getOrCreate).toHaveBeenCalledWith(guestPrincipal);
  });

  it('forwards the requested Store avatar and authenticated user principal', async () => {
    const expected = {
      id: 'companion-1',
      appearance: { type: 'STORE_AVATAR', storeItemId: 'avatar-1' },
    };
    profiles.equipAppearance.mockResolvedValue(expected);

    await expect(controller.equipAppearance('avatar-1', { principal: userPrincipal })).resolves.toBe(
      expected,
    );
    expect(profiles.equipAppearance).toHaveBeenCalledWith(userPrincipal, 'avatar-1');
  });

  it('resets the appearance for the authenticated user principal', async () => {
    const expected = { id: 'companion-1', appearance: { type: 'DEFAULT' } };
    profiles.unequipAppearance.mockResolvedValue(expected);

    await expect(controller.unequipAppearance({ principal: userPrincipal })).resolves.toBe(expected);
    expect(profiles.unequipAppearance).toHaveBeenCalledWith(userPrincipal);
  });
});
