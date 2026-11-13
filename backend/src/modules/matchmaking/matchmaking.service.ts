import { BadRequestException, ConflictException, Injectable, TooManyRequestsException } from '@nestjs/common';
import { MatchmakingEntryStatus, PrincipalType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { MatchService } from '../match/match.service';
import { MatchmakingGateway } from './matchmaking.gateway';

const SUPPORTED_CATEGORIES = new Set(['general', 'general-knowledge', 'english', 'math', 'mathematics', 'programming', 'cars', 'chess', 'memory', 'logic', 'knowledge', 'reaction', 'focus', 'language', 'science']);

function configuredPositiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

type QueueEntry = {
  id: string;
  userId: string | null;
  guestIdentityId: string | null;
  category: string;
  language: string;
  status: MatchmakingEntryStatus;
  matchId: string | null;
  queuedAt: Date;
  matchedAt: Date | null;
  cancelledAt: Date | null;
  expiresAt: Date | null;
};

@Injectable()
export class MatchmakingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matches: MatchService,
    private readonly gateway: MatchmakingGateway,
  ) {}

  async enqueue(principal: AuthenticatedPrincipal, input: { category: string; language: string; idempotencyKey: string }) {
    const category = input.category.trim().toLowerCase();
    const language = input.language.trim().toLowerCase();
    if (!SUPPORTED_CATEGORIES.has(category)) throw new BadRequestException('Unsupported matchmaking category');
    if (language !== 'en' && language !== 'fa') throw new BadRequestException('Unsupported matchmaking language');

    const outcome = await this.prisma.$transaction(async (tx) => {
      // Serialize only one compatibility bucket; advisory hash collisions only reduce concurrency.
      const bucket = `nexira:1v1:${category}:${language}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${bucket})) IS NULL AS locked`;

      const prior = await tx.matchmakingEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (prior) {
        if (!this.ownsEntry(prior, principal)) throw new ConflictException('Idempotency key is already in use');
        return { state: this.toQueueState(prior), notificationPrincipals: [] as AuthenticatedPrincipal[] };
      }

      const principalData = principal.principalType === PrincipalType.USER
        ? { userId: principal.principalId, guestIdentityId: null }
        : { userId: null, guestIdentityId: principal.principalId };
      const principalLock = `nexira:1v1:principal:${principal.principalType}:${principal.principalId}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${principalLock})) IS NULL AS locked`;
      const now = new Date();
      const recentEnqueues = await tx.matchmakingEntry.count({
        where: { ...principalData, queuedAt: { gte: new Date(now.getTime() - 60_000) } },
      });
      if (recentEnqueues >= configuredPositiveInteger('NEXIRA_MATCHMAKING_MAX_ENQUEUES_PER_MINUTE', 10)) {
        throw new TooManyRequestsException('Matchmaking enqueue rate limit exceeded');
      }
      const queueTtlSeconds = configuredPositiveInteger('NEXIRA_MATCHMAKING_QUEUE_TTL_SECONDS', 300);
      await tx.matchmakingEntry.updateMany({
        where: { ...principalData, status: MatchmakingEntryStatus.WAITING, expiresAt: { lte: now } },
        data: { status: MatchmakingEntryStatus.EXPIRED },
      });
      await tx.matchmakingEntry.updateMany({
        where: { status: MatchmakingEntryStatus.WAITING, category, language, expiresAt: { lte: now } },
        data: { status: MatchmakingEntryStatus.EXPIRED },
      });
      const entry = await tx.matchmakingEntry.create({
        data: {
          ...principalData,
          category,
          language,
          idempotencyKey: input.idempotencyKey,
          expiresAt: new Date(now.getTime() + queueTtlSeconds * 1000),
        },
      });

      const userId = principal.principalType === PrincipalType.USER ? principal.principalId : null;
      const guestIdentityId = principal.principalType === PrincipalType.GUEST ? principal.principalId : null;
      const candidates = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "MatchmakingEntry"
        WHERE "status" = 'WAITING'::"MatchmakingEntryStatus"
          AND "category" = ${category}
          AND "language" = ${language}
          AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
          AND "id" <> ${entry.id}::uuid
          AND NOT (
            (${userId}::uuid IS NOT NULL AND "userId" = ${userId}::uuid)
            OR (${guestIdentityId}::uuid IS NOT NULL AND "guestIdentityId" = ${guestIdentityId}::uuid)
          )
        ORDER BY "queuedAt" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      if (candidates.length === 0) return { state: this.toQueueState(entry), notificationPrincipals: [] as AuthenticatedPrincipal[] };

      const opponent = await tx.matchmakingEntry.findUnique({ where: { id: candidates[0].id } });
      if (!opponent || opponent.status !== MatchmakingEntryStatus.WAITING) return { state: this.toQueueState(entry), notificationPrincipals: [] as AuthenticatedPrincipal[] };

      const match = await this.matches.createOneVsOne(
        this.toPrincipal(opponent),
        this.toPrincipal(entry),
        tx,
        { category, language },
      );
      const matchedAt = new Date();
      const consumed = await tx.matchmakingEntry.updateMany({
        where: { id: { in: [entry.id, opponent.id] }, status: MatchmakingEntryStatus.WAITING },
        data: { status: MatchmakingEntryStatus.MATCHED, matchId: match.id, matchedAt },
      });
      if (consumed.count !== 2) throw new ConflictException('Queue entries were concurrently consumed');

      return {
        state: {
          queueId: entry.id,
        status: MatchmakingEntryStatus.MATCHED,
        matchId: match.id,
        match,
        category,
        language,
        queuedAt: entry.queuedAt,
        matchedAt,
        expiresAt: entry.expiresAt,
        },
        notificationPrincipals: [this.toPrincipal(opponent), this.toPrincipal(entry)],
      };
    }, { maxWait: 5000, timeout: 15000 }).catch((error: unknown) => {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('An active queue entry or idempotency key already exists');
      }
      throw error;
    });

    if (outcome.notificationPrincipals.length > 0 && outcome.state.matchId) {
      await this.gateway.notifyMatchFound(outcome.notificationPrincipals, {
        matchId: outcome.state.matchId,
        match: 'match' in outcome.state ? outcome.state.match : null,
      });
    }
    return outcome.state;
  }

  async getMine(principal: AuthenticatedPrincipal) {
    await this.prisma.matchmakingEntry.updateMany({
      where: { ...this.principalWhere(principal), status: MatchmakingEntryStatus.WAITING, expiresAt: { lte: new Date() } },
      data: { status: MatchmakingEntryStatus.EXPIRED },
    });
    const entry = await this.prisma.matchmakingEntry.findFirst({
      where: this.principalWhere(principal),
      orderBy: { queuedAt: 'desc' },
    });
    if (!entry) return { status: 'NOT_QUEUED' as const };
    const match = entry.matchId ? await this.matches.getMatch(entry.matchId, principal) : null;
    return { ...this.toQueueState(entry), match };
  }

  async cancel(principal: AuthenticatedPrincipal) {
    await this.prisma.matchmakingEntry.updateMany({
      where: { ...this.principalWhere(principal), status: MatchmakingEntryStatus.WAITING },
      data: { status: MatchmakingEntryStatus.CANCELLED, cancelledAt: new Date() },
    });
    return this.getMine(principal);
  }

  private isUniqueConstraintError(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }

  private principalWhere(principal: AuthenticatedPrincipal) {
    return principal.principalType === PrincipalType.USER
      ? { userId: principal.principalId }
      : { guestIdentityId: principal.principalId };
  }

  private ownsEntry(entry: { userId: string | null; guestIdentityId: string | null }, principal: AuthenticatedPrincipal) {
    return principal.principalType === PrincipalType.USER
      ? entry.userId === principal.principalId
      : entry.guestIdentityId === principal.principalId;
  }

  private toPrincipal(entry: { userId: string | null; guestIdentityId: string | null }): AuthenticatedPrincipal {
    if (entry.userId) return { principalType: PrincipalType.USER, principalId: entry.userId, sessionId: 'internal-matchmaking' };
    if (entry.guestIdentityId) return { principalType: PrincipalType.GUEST, principalId: entry.guestIdentityId, sessionId: 'internal-matchmaking' };
    throw new Error('Matchmaking entry has no principal');
  }

  private toQueueState(entry: QueueEntry) {
    return {
      queueId: entry.id,
      status: entry.status,
      matchId: entry.matchId,
      category: entry.category,
      language: entry.language,
      queuedAt: entry.queuedAt,
      matchedAt: entry.matchedAt,
      cancelledAt: entry.cancelledAt,
      expiresAt: entry.expiresAt,
    };
  }
}