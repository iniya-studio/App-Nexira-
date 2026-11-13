import { BadRequestException, TooManyRequestsException } from '@nestjs/common';
import { MatchmakingEntryStatus, PrincipalType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchService } from '../match/match.service';
import { MatchmakingService } from './matchmaking.service';

describe('MatchmakingService', () => {
  const queuedAt = new Date('2026-11-14T10:00:00.000Z');
  const guest = { principalType: PrincipalType.GUEST, principalId: 'guest-new', sessionId: 'session-new' };
  const input = { category: 'general', language: 'fa', idempotencyKey: 'request-key-00000001' };

  function setup(overrides: Record<string, unknown> = {}) {
    const entry = {
      id: 'entry-new', userId: null, guestIdentityId: 'guest-new',
      category: 'general', language: 'fa', status: MatchmakingEntryStatus.WAITING,
      matchId: null, queuedAt, matchedAt: null, cancelledAt: null, expiresAt: new Date(queuedAt.getTime() + 300_000),
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      matchmakingEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(entry),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
      matchmakingEntry: {
        findFirst: jest.fn().mockResolvedValue(entry),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;
    const matches = { createOneVsOne: jest.fn(), getMatch: jest.fn().mockResolvedValue(null) } as unknown as MatchService;
    const gateway = { notifyMatchFound: jest.fn().mockResolvedValue(undefined) };
    Object.assign(tx, overrides);
    return { service: new MatchmakingService(prisma, matches, gateway as never), prisma, tx, entry, matches, gateway };
  }

  it('persists a waiting entry when no compatible opponent exists', async () => {
    const { service, prisma, tx } = setup();
    await expect(service.enqueue(guest, input)).resolves.toMatchObject({
      queueId: 'entry-new', status: MatchmakingEntryStatus.WAITING, matchId: null,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.matchmakingEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: null, guestIdentityId: 'guest-new', category: 'general', language: 'fa', idempotencyKey: input.idempotencyKey, expiresAt: expect.any(Date) }),
    });
  });

  it('rejects categories outside the server-supported list before opening a transaction', async () => {
    const { service, prisma } = setup();
    await expect(service.enqueue(guest, { ...input, category: 'not-a-category' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns the original state for an idempotent retry owned by the same principal', async () => {
    const { service, tx } = setup();
    tx.matchmakingEntry.findUnique.mockResolvedValue({
      id: 'entry-existing', userId: null, guestIdentityId: 'guest-new',
      category: 'general', language: 'fa', status: MatchmakingEntryStatus.WAITING,
      matchId: null, queuedAt, matchedAt: null, cancelledAt: null, expiresAt: new Date(queuedAt.getTime() + 300_000),
    });
    await expect(service.enqueue(guest, input)).resolves.toMatchObject({
      queueId: 'entry-existing', status: MatchmakingEntryStatus.WAITING,
    });
    expect(tx.matchmakingEntry.create).not.toHaveBeenCalled();
  });



  it('prevents a principal from entering a second queue while a prior 1v1 is active', async () => {
    const { service, tx } = setup();
    tx.matchmakingEntry.findFirst.mockResolvedValue({ id: 'active-queue-entry' });
    await expect(service.enqueue(guest, input)).rejects.toThrow('A 1v1 match is already active for this principal');
    expect(tx.matchmakingEntry.create).not.toHaveBeenCalled();
  });
  it('enforces a durable per-principal enqueue rate limit', async () => {
    const { service, tx } = setup();
    tx.matchmakingEntry.count.mockResolvedValue(10);
    await expect(service.enqueue(guest, input)).rejects.toBeInstanceOf(TooManyRequestsException);
    expect(tx.matchmakingEntry.create).not.toHaveBeenCalled();
  });
  it('creates exactly one shared 1v1 match and consumes both entries atomically', async () => {
    const { service, tx, matches, entry, gateway } = setup();
    const opponent = {
      id: 'entry-old', userId: 'user-old', guestIdentityId: null,
      category: 'general', language: 'fa', status: MatchmakingEntryStatus.WAITING,
      matchId: null, queuedAt: new Date(queuedAt.getTime() - 1000), matchedAt: null, cancelledAt: null, expiresAt: new Date(queuedAt.getTime() + 300_000),
    };
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: opponent.id }]);
    tx.matchmakingEntry.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(opponent);
    const match = { id: 'match-created', mode: 'ONE_V_ONE', status: 'WAITING' };
    (matches.createOneVsOne as jest.Mock).mockResolvedValue(match);
    tx.matchmakingEntry.updateMany.mockResolvedValue({ count: 2 });
    await expect(service.enqueue(guest, input)).resolves.toMatchObject({
      queueId: entry.id, status: MatchmakingEntryStatus.MATCHED, matchId: match.id, match,
    });
    expect(matches.createOneVsOne).toHaveBeenCalledWith(
      expect.objectContaining({ principalType: PrincipalType.USER, principalId: 'user-old' }),
      expect.objectContaining({ principalType: PrincipalType.GUEST, principalId: 'guest-new' }),
      tx,
      { category: 'general', language: 'fa' },
    );
    expect(gateway.notifyMatchFound).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ matchId: match.id }));
    expect(tx.matchmakingEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [entry.id, opponent.id] }, status: MatchmakingEntryStatus.WAITING },
      data: expect.objectContaining({ status: MatchmakingEntryStatus.MATCHED, matchId: match.id }),
    }));
  });
});