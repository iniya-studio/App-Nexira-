import { randomUUID } from 'node:crypto';
import { PrincipalType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { MatchService } from '../match/match.service';
import { MatchmakingService } from './matchmaking.service';

describe('Public 1v1 matchmaking PostgreSQL integration', () => {
  const prisma = new PrismaService();
  const matches = new MatchService(prisma);
  const gateway = { notifyMatchFound: jest.fn().mockResolvedValue(undefined) };
  const matchmaking = new MatchmakingService(prisma, matches, gateway as never);
  const queueIds: string[] = [];
  const matchIds: string[] = [];
  const guestIds: string[] = [];
  const userIds: string[] = [];
  const sessionIds: string[] = [];

  beforeAll(async () => { await prisma.$connect(); });
  afterEach(async () => {
    if (queueIds.length) { await prisma.matchmakingEntry.deleteMany({ where: { id: { in: queueIds } } }); queueIds.length = 0; }
    if (matchIds.length) { await prisma.match.deleteMany({ where: { id: { in: matchIds } } }); matchIds.length = 0; }
    if (sessionIds.length) { await prisma.userSession.deleteMany({ where: { id: { in: sessionIds } } }); sessionIds.length = 0; }
    if (guestIds.length) { await prisma.guestIdentity.deleteMany({ where: { id: { in: guestIds } } }); guestIds.length = 0; }
    if (userIds.length) { await prisma.user.deleteMany({ where: { id: { in: userIds } } }); userIds.length = 0; }
  });
  afterAll(async () => { await prisma.$disconnect(); });

  async function createGuest(): Promise<AuthenticatedPrincipal> {
    const guest = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(guest.id);
    const session = await prisma.userSession.create({
      data: { guestIdentityId: guest.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    sessionIds.push(session.id);
    return { principalType: PrincipalType.GUEST, principalId: guest.id, sessionId: session.id };
  }
  async function createUser(): Promise<AuthenticatedPrincipal> {
    const user = await prisma.user.create({ data: { username: `queue-${randomUUID()}`, displayName: 'Queue Integration' } });
    userIds.push(user.id);
    const session = await prisma.userSession.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    sessionIds.push(session.id);
    return { principalType: PrincipalType.USER, principalId: user.id, sessionId: session.id };
  }
  const request = (category = 'general', language = 'fa') => ({
    category, language, idempotencyKey: `queue-${randomUUID()}`,
  });

  it('pairs compatible guest and registered users into one persisted 1v1 match', async () => {
    const first = await createGuest();
    const second = await createUser();
    const firstQueue = await matchmaking.enqueue(first, request());
    queueIds.push(firstQueue.queueId);
    expect(firstQueue.status).toBe('WAITING');

    const secondQueue = await matchmaking.enqueue(second, request());
    queueIds.push(secondQueue.queueId);
    expect(secondQueue.status).toBe('MATCHED');
    expect(secondQueue.matchId).toBeTruthy();
    matchIds.push(secondQueue.matchId!);

    const entries = await prisma.matchmakingEntry.findMany({ where: { id: { in: [firstQueue.queueId, secondQueue.queueId] } } });
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.status === 'MATCHED' && entry.matchId === secondQueue.matchId)).toBe(true);
    const stored = await prisma.match.findUniqueOrThrow({ where: { id: secondQueue.matchId! }, include: { participants: true, questionGenerationJobs: true } });
    expect(stored.mode).toBe('ONE_V_ONE');
    expect(stored.participants).toHaveLength(2);
    expect(stored.participants.every((participant) => participant.participantType === 'HUMAN')).toBe(true);
    expect(stored.questionGenerationJobs).toHaveLength(1);
    await expect(matchmaking.enqueue(first, request())).rejects.toThrow('A 1v1 match is already active for this principal');
    await expect(matchmaking.getMine(first)).resolves.toMatchObject({
      status: 'MATCHED', matchId: secondQueue.matchId, match: { id: secondQueue.matchId },
    });
  });

  it('never pairs entries with different category or language', async () => {
    const a = await createGuest();
    const b = await createGuest();
    const c = await createGuest();
    const qa = await matchmaking.enqueue(a, request('general', 'fa'));
    const qb = await matchmaking.enqueue(b, request('math', 'fa'));
    const qc = await matchmaking.enqueue(c, request('general', 'en'));
    queueIds.push(qa.queueId, qb.queueId, qc.queueId);
    expect([qa.status, qb.status, qc.status]).toEqual(['WAITING', 'WAITING', 'WAITING']);
    expect([qa.matchId, qb.matchId, qc.matchId]).toEqual([null, null, null]);
  });

  it('makes enqueue idempotent and prevents one principal from occupying two waiting slots', async () => {
    const principal = await createGuest();
    const key = request();
    const first = await matchmaking.enqueue(principal, key);
    queueIds.push(first.queueId);
    const retry = await matchmaking.enqueue(principal, key);
    expect(retry.queueId).toBe(first.queueId);
    await expect(matchmaking.enqueue({ ...principal, sessionId: randomUUID() }, request())).rejects.toThrow('An active queue entry or idempotency key already exists');
    expect(await prisma.matchmakingEntry.count({ where: { guestIdentityId: principal.principalId, status: 'WAITING' } })).toBe(1);
  });

  it('expires stale waiting entries and never pairs against an expired queue row', async () => {
    const first = await createGuest();
    const second = await createGuest();
    const queued = await matchmaking.enqueue(first, request());
    queueIds.push(queued.queueId);
    await prisma.matchmakingEntry.update({ where: { id: queued.queueId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(matchmaking.getMine(first)).resolves.toMatchObject({ status: 'EXPIRED', matchId: null });
    const secondQueue = await matchmaking.enqueue(second, request());
    queueIds.push(secondQueue.queueId);
    expect(secondQueue.status).toBe('WAITING');
    expect(secondQueue.matchId).toBeNull();
  });
  it('pairs four concurrent compatible enqueues into two distinct matches without double consumption', async () => {
    const principals = await Promise.all([createGuest(), createGuest(), createGuest(), createGuest()]);
    const results = await Promise.all(principals.map((principal) => matchmaking.enqueue(principal, request('general', 'en'))));
    queueIds.push(...results.map((result) => result.queueId));
    const entries = await prisma.matchmakingEntry.findMany({ where: { id: { in: queueIds } } });
    expect(entries).toHaveLength(4);
    expect(entries.every((entry) => entry.status === 'MATCHED' && entry.matchId !== null)).toBe(true);
    const uniqueMatchIds = [...new Set(entries.map((entry) => entry.matchId!))];
    expect(uniqueMatchIds).toHaveLength(2);
    for (const matchId of uniqueMatchIds) {
      matchIds.push(matchId);
      expect(await prisma.matchParticipant.count({ where: { matchId, participantType: 'HUMAN' } })).toBe(2);
      expect(await prisma.matchmakingEntry.count({ where: { matchId, status: 'MATCHED' } })).toBe(2);
    }
  });
  it('resolves cancellation racing with pairing to one valid terminal outcome', async () => {
    const first = await createGuest();
    const second = await createGuest();
    const queued = await matchmaking.enqueue(first, request());
    queueIds.push(queued.queueId);
    const [cancelResult, enqueueResult] = await Promise.allSettled([
      matchmaking.cancel(first),
      matchmaking.enqueue(second, request()),
    ]);
    expect(cancelResult.status).toBe('fulfilled');
    expect(enqueueResult.status).toBe('fulfilled');
    if (enqueueResult.status === 'fulfilled') queueIds.push(enqueueResult.value.queueId);
    const statuses = await prisma.matchmakingEntry.findMany({ where: { id: { in: queueIds } }, select: { status: true, matchId: true } });
    const paired = statuses.every((entry) => entry.status === 'MATCHED' && entry.matchId !== null);
    const cancelled = statuses.some((entry) => entry.status === 'CANCELLED') && statuses.every((entry) => entry.status === 'CANCELLED' || entry.status === 'WAITING');
    expect(paired || cancelled).toBe(true);
    if (paired) matchIds.push(statuses[0].matchId!);
  });

  it('rolls back the new entry when shared match creation fails', async () => {
    const first = await createGuest();
    const second = await createGuest();
    const queued = await matchmaking.enqueue(first, request());
    queueIds.push(queued.queueId);
    const failingMatches = { createOneVsOne: jest.fn().mockRejectedValue(new Error('forced match creation failure')) };
    const failingService = new MatchmakingService(prisma, failingMatches as unknown as MatchService, gateway as never);
    await expect(failingService.enqueue(second, request())).rejects.toThrow('forced match creation failure');
    const rows = await prisma.matchmakingEntry.findMany({ where: { guestIdentityId: { in: [first.principalId, second.principalId] } } });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(queued.queueId);
    expect(rows[0].status).toBe('WAITING');
  });
});