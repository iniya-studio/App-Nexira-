import { MatchStatus, PrincipalType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { ProfileService } from './profile.service';
describe('ProfileService', () => {
  const user: AuthenticatedPrincipal = { principalType: PrincipalType.USER, principalId: 'user-1', sessionId: 's1' };
  const guest: AuthenticatedPrincipal = { principalType: PrincipalType.GUEST, principalId: 'guest-123456', sessionId: 's2' };
  const prisma = {
    user: { findFirst: jest.fn(), updateMany: jest.fn() },
    guestIdentity: { findFirst: jest.fn(), updateMany: jest.fn() },
    matchParticipant: { findMany: jest.fn() },
  };
  let service: ProfileService;
  beforeEach(() => { jest.clearAllMocks(); service = new ProfileService(prisma as unknown as PrismaService); });
  it('returns registered profile and finalized match statistics from server records', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1', username: 'player_1', displayName: 'Player One', preferredLanguage: 'en', createdAt: new Date(),
    });
    prisma.matchParticipant.findMany.mockResolvedValue([
      { id: 'p1', match: { result: { winnerParticipantId: 'p1' } } },
      { id: 'p2', match: { result: { winnerParticipantId: 'p1' } } },
    ]);
    const result = await service.getMyProfile(user);
    expect(result.statistics).toEqual({ matchesPlayed: 2, wins: 1, losses: 1, draws: 0, availability: 'AVAILABLE' });
    expect(JSON.stringify(result)).not.toContain('email');
    expect(prisma.matchParticipant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', match: { is: { status: MatchStatus.COMPLETED, result: { isNot: null } } } },
    }));
  });
  it('returns a deterministic guest name and finalized match statistics', async () => {
    prisma.guestIdentity.findFirst.mockResolvedValue({ id: guest.principalId, displayName: null, createdAt: new Date() });
    prisma.matchParticipant.findMany.mockResolvedValue([
      { id: 'p1', match: { result: { winnerParticipantId: 'p1' } } },
      { id: 'p2', match: { result: { winnerParticipantId: 'p1' } } },
      { id: 'p3', match: { result: { winnerParticipantId: null } } },
    ]);
    const result = await service.getMyProfile(guest);
    expect(result.profile.displayName).toBe('Player-guest1');
    expect(result.statistics).toEqual({ matchesPlayed: 3, wins: 1, losses: 1, draws: 1, availability: 'AVAILABLE' });
  });
  it('normalizes and persists a registered display name', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1', username: 'player_1', displayName: 'Café', preferredLanguage: 'en', createdAt: new Date(),
    });
    prisma.matchParticipant.findMany.mockResolvedValue([]);
    const result = await service.updateMyProfile(user, { displayName: 'Cafe\u0301' });
    expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { displayName: 'Café' } }));
    expect(result.profile.displayName).toBe('Café');
  });
  it('rejects guest language mutation', async () => {
    await expect(service.updateMyProfile(guest, { preferredLanguage: 'fa' })).rejects.toThrow(
      'Guest language is a device preference until account conversion',
    );
    expect(prisma.guestIdentity.updateMany).not.toHaveBeenCalled();
  });
  it('rejects empty updates', async () => {
    await expect(service.updateMyProfile(user, {})).rejects.toThrow('At least one supported profile field is required');
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
