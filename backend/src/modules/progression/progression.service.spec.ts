import { PrincipalType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { ProgressionService } from './progression.service';

describe('ProgressionService', () => {
  const userPrincipal: AuthenticatedPrincipal = {
    principalType: PrincipalType.USER,
    principalId: 'user-1',
    sessionId: 'session-1',
  };
  const guestPrincipal: AuthenticatedPrincipal = {
    principalType: PrincipalType.GUEST,
    principalId: 'guest-1',
    sessionId: 'guest-session-1',
  };

  const prisma = {
    userProgress: { findUnique: jest.fn() },
    guestProgress: { findUnique: jest.fn() },
    globalUserRanking: { findMany: jest.fn(), findUnique: jest.fn() },
    rankingSeason: { findMany: jest.fn() },
    userRanking: { findMany: jest.fn(), findUnique: jest.fn() },
  };

  let service: ProgressionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProgressionService(prisma as unknown as PrismaService);
  });

  it('returns the registered user XP and level snapshot without exposing BigInt JSON values', async () => {
    prisma.userProgress.findUnique.mockResolvedValue({
      level: 3,
      currentLevelXp: 25,
      totalXp: BigInt(325),
    });

    await expect(service.getMyProgress(userPrincipal)).resolves.toEqual({
      principalType: PrincipalType.USER,
      level: 3,
      currentLevelXp: 25,
      totalXp: '325',
      xpRequiredForNextLevel: 300,
      xpRemaining: 275,
      progressPercent: 8,
    });
  });

  it('returns a safe level-one snapshot for a guest with no XP yet', async () => {
    prisma.guestProgress.findUnique.mockResolvedValue(null);

    await expect(service.getMyProgress(guestPrincipal)).resolves.toEqual({
      principalType: PrincipalType.GUEST,
      level: 1,
      currentLevelXp: 0,
      totalXp: '0',
      xpRequiredForNextLevel: 100,
      xpRemaining: 100,
      progressPercent: 0,
    });
  });

  it('does not expose competitive ranking to an unconverted guest', async () => {
    prisma.globalUserRanking.findMany.mockResolvedValue([]);

    await expect(service.getGlobalRanking(guestPrincipal)).resolves.toEqual({
      scope: 'GLOBAL',
      eligible: false,
      entries: [],
      me: null,
    });
    expect(prisma.globalUserRanking.findUnique).not.toHaveBeenCalled();
  });

  it('returns registered global ranking rows and the current user snapshot', async () => {
    prisma.globalUserRanking.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        rankingPoints: 20,
        wins: 1,
        losses: 0,
        draws: 0,
        matchesPlayed: 1,
        user: { username: 'player_one', displayName: 'Player One' },
      },
    ]);
    prisma.globalUserRanking.findUnique.mockResolvedValue({
      userId: 'user-1',
      rankingPoints: 20,
      wins: 1,
      losses: 0,
      draws: 0,
      matchesPlayed: 1,
    });

    await expect(service.getGlobalRanking(userPrincipal)).resolves.toMatchObject({
      scope: 'GLOBAL',
      eligible: true,
      entries: [{
        position: 1,
        userId: 'user-1',
        username: 'player_one',
        displayName: 'Player One',
        rankingPoints: 20,
      }],
      me: {
        position: 1,
        rankingPoints: 20,
        wins: 1,
        losses: 0,
        draws: 0,
        matchesPlayed: 1,
      },
    });
  });

  it('returns an empty seasonal leaderboard when no season is active', async () => {
    prisma.rankingSeason.findMany.mockResolvedValue([]);

    await expect(service.getCurrentSeasonRanking(userPrincipal)).resolves.toEqual({
      scope: 'SEASON',
      eligible: true,
      season: null,
      entries: [],
      me: null,
    });
  });

  it('rejects overlapping active ranking seasons instead of choosing one arbitrarily', async () => {
    prisma.rankingSeason.findMany.mockResolvedValue([
      { id: 'season-1', name: 'Season One', startsAt: new Date(), endsAt: new Date() },
      { id: 'season-2', name: 'Season Two', startsAt: new Date(), endsAt: new Date() },
    ]);

    await expect(service.getCurrentSeasonRanking(userPrincipal)).rejects.toThrow(
      'Multiple active ranking seasons are configured',
    );
    expect(prisma.userRanking.findMany).not.toHaveBeenCalled();
  });
});
