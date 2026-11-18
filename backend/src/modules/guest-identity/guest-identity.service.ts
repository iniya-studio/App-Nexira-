import { ConflictException, ForbiddenException, GoneException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuestIdentityStatus, MatchStatus, PrincipalType, Prisma, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { SessionService } from '../session/session.service';
import { EmailVerificationService } from '../auth/email-verification.service';
import { GuestConversionDto } from './dto/guest-conversion.dto';
import { GuestConversionReplayCrypto, GuestConversionReplayAad } from './guest-conversion-replay-crypto';

type GuestConversionResponse = {
  user: { id: string; email: string | null; username: string; displayName: string; preferredLanguage: string; emailVerifiedAt: Date | null };
  principal: { principalType: PrincipalType; principalId: string };
  session: { sessionId: string; expiresAt: string };
  tokens: { accessToken: string; accessTokenExpiresAt: string; refreshToken: string; refreshTokenExpiresAt: string };
  emailVerification: { required: true; verified: false };
};

@Injectable()
export class GuestIdentityService {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();
  private readonly replayCrypto: GuestConversionReplayCrypto;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
    private readonly emailVerification: EmailVerificationService,
  ) { this.replayCrypto = new GuestConversionReplayCrypto(config); }

  async start(clientKey: string) {
    this.enforceStartLimit(clientKey);
    return this.prisma.$transaction(async (tx) => {
      const guest = await tx.guestIdentity.create({
        data: { status: GuestIdentityStatus.ACTIVE },
      });
      const credentials = await this.sessions.createSessionInTransaction(tx, {
        principalType: PrincipalType.GUEST,
        principalId: guest.id,
      });
      await tx.identityAuditEvent.create({
        data: {
          eventType: 'GUEST_IDENTITY_CREATED',
          principalType: PrincipalType.GUEST,
          principalId: guest.id,
          sessionId: credentials.session.sessionId,
          result: 'SUCCESS',
        },
      });
      return credentials;
    });
  }

  async convert(principal: AuthenticatedPrincipal, input: GuestConversionDto, idempotencyKey: string): Promise<GuestConversionResponse> {
    if (principal.principalType !== PrincipalType.GUEST) {
      throw new ForbiddenException('Only an authenticated guest can be converted');
    }
    this.enforceConversionLimit(principal.principalId);
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(idempotencyKey) || !/^[A-Za-z0-9_-]{43,128}$/.test(input.refreshToken)) {
      throw new UnauthorizedException('Invalid guest conversion proof');
    }
    const sourceRefreshTokenHash = this.replayCrypto.hash(input.refreshToken);
    const idempotencyKeyHash = this.replayCrypto.hash(idempotencyKey);

    const email = input.email.trim().toLowerCase();
    const username = input.username.trim().toLowerCase();
    const requestedDisplayName = input.displayName?.normalize('NFC').trim();
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: this.positiveInteger('ARGON2_MEMORY_COST_KIB', 19456),
      timeCost: this.positiveInteger('ARGON2_TIME_COST', 2),
      parallelism: this.positiveInteger('ARGON2_PARALLELISM', 1),
    });

    let converted: GuestConversionResponse;
    try {
      converted = await this.prisma.$transaction(async (tx) => {
        // READ COMMITTED is intentional: after this transaction waits for the GuestIdentity
        // row lock, later statements must see any GuestProgress committed by settlement.
        // SERIALIZABLE fixes a transaction-wide snapshot before the lock wait and can miss
        // that committed progression. The shared identity lock serializes settlement vs.
        // conversion; advisory/Match/session locks and database constraints protect the
        // matchmaking, ownership, and exactly-once invariants within this atomic transaction.
        // Matchmaking and conversion share the same principal -> bucket lock order.
        // This prevents a guest enqueue from creating a queue row while conversion
        // is transferring ownership.
        const principalLock = `nexira:1v1:principal:GUEST:${principal.principalId}`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${principalLock})) IS NULL AS locked`;

        const waitingBuckets = await tx.matchmakingEntry.findMany({
          where: { guestIdentityId: principal.principalId, status: 'WAITING' },
          select: { category: true, language: true },
        });
        const bucketLocks = [...new Set(
          waitingBuckets.map((entry) => `nexira:1v1:${entry.category}:${entry.language}`),
        )].sort();
        for (const bucket of bucketLocks) {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${bucket})) IS NULL AS locked`;
        }

        // Match finalization locks Match -> GuestIdentity. Lock any active Match rows
        // first, in stable order, so conversion cannot deadlock with finalization.
        const activeCandidates = await tx.matchmakingEntry.findMany({
          where: {
            guestIdentityId: principal.principalId,
            status: 'MATCHED',
            match: { status: { in: [MatchStatus.WAITING, MatchStatus.READY, MatchStatus.ACTIVE] } },
          },
          select: { matchId: true },
        });
        const candidateMatchIds = [...new Set(
          activeCandidates.map((entry) => entry.matchId).filter((id): id is string => id !== null),
        )].sort();
        for (const matchId of candidateMatchIds) {
          await tx.$queryRaw`SELECT "id" FROM "Match" WHERE "id" = ${matchId}::uuid FOR UPDATE`;
        }
        const activeMatchedEntries = await tx.matchmakingEntry.findMany({
          where: {
            guestIdentityId: principal.principalId,
            status: 'MATCHED',
            match: { status: { in: [MatchStatus.WAITING, MatchStatus.READY, MatchStatus.ACTIVE] } },
          },
          select: { id: true, matchId: true },
        });
        const activeMatchIds = [...new Set(
          activeMatchedEntries.map((entry) => entry.matchId).filter((id): id is string => id !== null),
        )];

        // Serialize conversion with match settlement so XP is transferred exactly once.
        await tx.$queryRawUnsafe(
          'SELECT "id" FROM "GuestIdentity" WHERE "id" = $1::uuid FOR UPDATE',
          principal.principalId,
        );
        const guest = await tx.guestIdentity.findUnique({
          where: { id: principal.principalId },
          select: { id: true, status: true, convertedToUserId: true, displayName: true },
        });
        if (!guest) throw new UnauthorizedException('Guest identity is no longer active');

        // Preserve the contract lock order: GuestIdentity -> source UserSession -> source RefreshToken.
        await tx.$queryRaw`SELECT "id" FROM "UserSession" WHERE "id" = ${principal.sessionId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "RefreshToken" WHERE "tokenHash" = ${sourceRefreshTokenHash} FOR UPDATE`;
        const [sourceSession, sourceRefreshToken] = await Promise.all([
          tx.userSession.findFirst({
            where: { id: principal.sessionId, guestIdentityId: guest.id, userId: null },
            select: { id: true, revokedAt: true, expiresAt: true },
          }),
          tx.refreshToken.findUnique({
            where: { tokenHash: sourceRefreshTokenHash },
            select: { id: true, sessionId: true, consumedAt: true, revokedAt: true, expiresAt: true },
          }),
        ]);
        if (!sourceSession || !sourceRefreshToken || sourceRefreshToken.sessionId !== sourceSession.id) {
          throw new UnauthorizedException('Invalid guest conversion proof');
        }

        // A request that passed AccessTokenGuard before another request committed may
        // recover only with the exact original refresh-token/idempotency-key pair.
        if (guest.status === GuestIdentityStatus.CONVERTED && guest.convertedToUserId) {
          const replay = await tx.guestConversionReplay.findUnique({ where: { guestIdentityId: guest.id } });
          if (!replay || replay.sourceSessionId !== sourceSession.id ||
              !this.replayCrypto.equalsHash(replay.sourceRefreshTokenHash, sourceRefreshTokenHash) ||
              !this.replayCrypto.equalsHash(replay.idempotencyKeyHash, idempotencyKeyHash)) {
            throw new UnauthorizedException('Invalid guest conversion proof');
          }
          if (replay.expiresAt <= new Date() || !replay.responseCiphertext) {
            throw new GoneException({ code: 'CONVERSION_RECOVERY_EXPIRED', message: 'Conversion recovery window has expired' });
          }
          const aad: GuestConversionReplayAad = {
            replayId: replay.id, guestIdentityId: replay.guestIdentityId, sourceSessionId: replay.sourceSessionId,
            sourceRefreshTokenHash: replay.sourceRefreshTokenHash, targetUserId: replay.targetUserId,
            idempotencyKeyHash: replay.idempotencyKeyHash,
          };
          try {
            const recovered = this.replayCrypto.decrypt<GuestConversionResponse>(replay.responseCiphertext, aad);
            await tx.identityAuditEvent.create({
              data: { eventType: 'GUEST_CONVERSION_RECOVERY_SUCCEEDED', principalType: PrincipalType.GUEST, principalId: guest.id, sessionId: sourceSession.id, result: 'SUCCESS' },
            });
            return recovered;
          } catch {
            await tx.identityAuditEvent.create({
              data: { eventType: 'GUEST_CONVERSION_RECOVERY_FAILED', principalType: PrincipalType.GUEST, principalId: guest.id, sessionId: sourceSession.id, result: 'FAILURE', metadata: { reason: 'CIPHERTEXT_INVALID' } },
            });
            throw new UnauthorizedException('Invalid guest conversion proof');
          }
        }
        if (guest.status !== GuestIdentityStatus.ACTIVE || guest.convertedToUserId ||
            sourceSession.revokedAt || sourceSession.expiresAt <= new Date() ||
            sourceRefreshToken.consumedAt || sourceRefreshToken.revokedAt || sourceRefreshToken.expiresAt <= new Date()) {
          throw new UnauthorizedException('Guest identity or source refresh token is no longer active');
        }

        const user = await tx.user.create({
          data: {
            email,
            username,
            displayName: requestedDisplayName || guest.displayName || `Player-${guest.id.slice(0, 6)}`,
            status: UserStatus.ACTIVE,
            credential: { create: { passwordHash } },
          },
          select: {
            id: true, email: true, username: true, displayName: true,
            preferredLanguage: true, emailVerifiedAt: true,
          },
        });

        const guestProgress = await tx.guestProgress.findUnique({
          where: { guestIdentityId: guest.id },
        });
        const guestXpTransactions = await tx.guestXPTransaction.findMany({
          where: { guestIdentityId: guest.id },
          orderBy: { createdAt: 'asc' },
        });
        if (guestProgress) {
          if (guestProgress.transferredAt) {
            throw new ConflictException('Guest progression was already transferred');
          }
          await tx.userProgress.create({
            data: {
              userId: user.id,
              level: guestProgress.level,
              currentLevelXp: guestProgress.currentLevelXp,
              totalXp: guestProgress.totalXp,
            },
          });
          for (const event of guestXpTransactions) {
            await tx.xPTransaction.create({
              data: {
                userId: user.id,
                matchId: event.matchId,
                amount: event.amount,
                reason: 'GUEST_CONVERSION_TRANSFER',
                idempotencyKey: `guest-conversion:${guest.id}:xp:${event.id}:v1`,
              },
            });
          }
          await tx.guestProgress.update({
            where: { guestIdentityId: guest.id },
            data: { transferredAt: new Date() },
          });
        } else if (guestXpTransactions.length > 0) {
          throw new Error('Guest XP ledger exists without its progress snapshot');
        }

        // Move the existing profile row, preserving its stable ID and appearance.
        // If the guest never created a Companion profile, keep the user's profile lazy.
        const profileTransfer = await tx.companionProfile.updateMany({
          where: { guestIdentityId: guest.id, userId: null },
          data: { guestIdentityId: null, userId: user.id },
        });

        // Preserve a waiting queue request when a guest upgrades to an account.
        // Re-read matched entries after this update because pairing may have committed
        // while conversion waited for the guest identity row lock.
        const waitingQueueTransfer = await tx.matchmakingEntry.updateMany({
          where: { guestIdentityId: guest.id, status: 'WAITING' },
          data: { guestIdentityId: null, userId: user.id },
        });
        let activeParticipantTransfer = 0;
        let matchedQueueTransfer = 0;
        if (activeMatchIds.length > 0) {
          const participantTransfer = await tx.matchParticipant.updateMany({
            where: { guestIdentityId: guest.id, matchId: { in: activeMatchIds } },
            data: { guestIdentityId: null, userId: user.id },
          });
          activeParticipantTransfer = participantTransfer.count;
          const queueTransfer = await tx.matchmakingEntry.updateMany({
            where: {
              id: { in: activeMatchedEntries.map((entry) => entry.id) },
              guestIdentityId: guest.id,
              status: 'MATCHED',
            },
            data: { guestIdentityId: null, userId: user.id },
          });
          matchedQueueTransfer = queueTransfer.count;
        }

        const now = new Date();
        const guestUpdate = await tx.guestIdentity.updateMany({
          where: { id: guest.id, status: GuestIdentityStatus.ACTIVE, convertedToUserId: null },
          data: {
            status: GuestIdentityStatus.CONVERTED,
            convertedToUserId: user.id,
            convertedAt: now,
          },
        });
        if (guestUpdate.count !== 1) throw new UnauthorizedException('Guest identity conversion conflicted');

        await tx.userSession.updateMany({
          where: { guestIdentityId: guest.id, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.refreshToken.updateMany({
          where: { session: { guestIdentityId: guest.id }, revokedAt: null },
          data: { revokedAt: now, retryResponseCiphertext: null, retryResponseExpiresAt: null },
        });

        const session = await this.sessions.createSessionInTransaction(tx, {
          principalType: PrincipalType.USER,
          principalId: user.id,
        });
        const response: GuestConversionResponse = {
          user, ...session, emailVerification: { required: true, verified: false },
        };
        const replayId = randomUUID();
        const replayExpiresAt = new Date(Math.min(
          Date.now() + this.replayCrypto.replayWindowSeconds() * 1000,
          new Date(session.tokens.accessTokenExpiresAt).getTime(),
        ));
        const replayAad: GuestConversionReplayAad = {
          replayId,
          guestIdentityId: guest.id,
          sourceSessionId: principal.sessionId,
          sourceRefreshTokenHash,
          targetUserId: user.id,
          idempotencyKeyHash,
        };
        await tx.guestConversionReplay.create({
          data: {
            id: replayId,
            guestIdentityId: guest.id,
            sourceSessionId: principal.sessionId,
            sourceRefreshTokenHash,
            idempotencyKeyHash,
            targetUserId: user.id,
            responseCiphertext: this.replayCrypto.encrypt(response, replayAad),
            expiresAt: replayExpiresAt,
          },
        });
        await tx.identityAuditEvent.create({
          data: {
            eventType: 'GUEST_IDENTITY_CONVERTED',
            principalType: PrincipalType.GUEST,
            principalId: guest.id,
            sessionId: session.session.sessionId,
            result: 'SUCCESS',
            metadata: {
              convertedToUserId: user.id,
              companionProfileTransferred: profileTransfer.count === 1,
              progressionTransferred: guestProgress !== null,
              xpTransactionsTransferred: guestXpTransactions.length,
              waitingQueueTransferred: waitingQueueTransfer.count,
              matchedQueueTransferred: matchedQueueTransfer,
              activeMatchParticipantsTransferred: activeParticipantTransfer,
            },
          },
        });
        return response;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('An account with this email or username already exists');
      }
      throw error;
    }

    try {
      await this.emailVerification.issueAndSend(converted.user.id);
    } catch {
      // Conversion is committed; email verification can be resent through the account workflow.
    }
    return converted;
  }

  async retryConversion(rawRefreshToken: string, idempotencyKey: string): Promise<GuestConversionResponse> {
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(rawRefreshToken) || !/^[A-Za-z0-9_-]{43,128}$/.test(idempotencyKey)) {
      throw new UnauthorizedException('Invalid guest conversion proof');
    }
    const sourceRefreshTokenHash = this.replayCrypto.hash(rawRefreshToken);
    const idempotencyKeyHash = this.replayCrypto.hash(idempotencyKey);
    const source = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sourceRefreshTokenHash },
      select: { sessionId: true, session: { select: { guestIdentityId: true, userId: true } } },
    });
    const guestId = source?.session.guestIdentityId;
    if (!source || !guestId || source.session.userId) {
      throw new UnauthorizedException('Invalid guest conversion proof');
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      const principalLock = `nexira:1v1:principal:GUEST:${guestId}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${principalLock})) IS NULL AS locked`;
      await tx.$queryRaw`SELECT "id" FROM "GuestIdentity" WHERE "id" = ${guestId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "UserSession" WHERE "id" = ${source.sessionId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "RefreshToken" WHERE "tokenHash" = ${sourceRefreshTokenHash} FOR UPDATE`;

      const guest = await tx.guestIdentity.findUnique({
        where: { id: guestId },
        select: { id: true, status: true, convertedToUserId: true },
      });
      const sourceSession = await tx.userSession.findFirst({
        where: { id: source.sessionId, guestIdentityId: guestId, userId: null },
        select: { id: true },
      });
      const refresh = await tx.refreshToken.findUnique({
        where: { tokenHash: sourceRefreshTokenHash },
        select: { id: true, sessionId: true },
      });
      if (!guest || guest.status !== GuestIdentityStatus.CONVERTED || !guest.convertedToUserId ||
          !sourceSession || !refresh || refresh.sessionId !== sourceSession.id) {
        return { kind: 'invalid' as const };
      }

      const replay = await tx.guestConversionReplay.findUnique({ where: { guestIdentityId: guestId } });
      if (!replay || replay.targetUserId !== guest.convertedToUserId ||
          replay.sourceSessionId !== source.sessionId ||
          !this.replayCrypto.equalsHash(replay.sourceRefreshTokenHash, sourceRefreshTokenHash) ||
          !this.replayCrypto.equalsHash(replay.idempotencyKeyHash, idempotencyKeyHash)) {
        await tx.identityAuditEvent.create({
          data: { eventType: 'GUEST_CONVERSION_RECOVERY_FAILED', principalType: PrincipalType.GUEST, principalId: guestId, sessionId: source.sessionId, result: 'FAILURE', metadata: { reason: 'PROOF_MISMATCH' } },
        });
        return { kind: 'invalid' as const };
      }

      if (replay.expiresAt <= new Date() || !replay.responseCiphertext) {
        if (replay.responseCiphertext) {
          await tx.guestConversionReplay.update({
            where: { id: replay.id },
            data: { responseCiphertext: null, ciphertextPurgedAt: new Date() },
          });
        }
        await tx.identityAuditEvent.create({
          data: { eventType: 'GUEST_CONVERSION_RECOVERY_EXPIRED', principalType: PrincipalType.GUEST, principalId: guestId, sessionId: source.sessionId, result: 'FAILURE', metadata: { reason: 'REPLAY_EXPIRED' } },
        });
        return { kind: 'expired' as const };
      }

      const aad: GuestConversionReplayAad = {
        replayId: replay.id,
        guestIdentityId: replay.guestIdentityId,
        sourceSessionId: replay.sourceSessionId,
        sourceRefreshTokenHash: replay.sourceRefreshTokenHash,
        targetUserId: replay.targetUserId,
        idempotencyKeyHash: replay.idempotencyKeyHash,
      };
      try {
        const response = this.replayCrypto.decrypt<GuestConversionResponse>(replay.responseCiphertext, aad);
        await tx.identityAuditEvent.create({
          data: { eventType: 'GUEST_CONVERSION_RECOVERY_SUCCEEDED', principalType: PrincipalType.GUEST, principalId: guestId, sessionId: source.sessionId, result: 'SUCCESS' },
        });
        return { kind: 'ok' as const, response };
      } catch {
        await tx.identityAuditEvent.create({
          data: { eventType: 'GUEST_CONVERSION_RECOVERY_FAILED', principalType: PrincipalType.GUEST, principalId: guestId, sessionId: source.sessionId, result: 'FAILURE', metadata: { reason: 'CIPHERTEXT_INVALID' } },
        });
        return { kind: 'invalid' as const };
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    if (outcome.kind === 'expired') {
      throw new GoneException({ code: 'CONVERSION_RECOVERY_EXPIRED', message: 'Conversion recovery window has expired' });
    }
    if (outcome.kind !== 'ok') throw new UnauthorizedException('Invalid guest conversion proof');
    return outcome.response;
  }

  async purgeExpiredReplayCiphertexts(batchSize = 500): Promise<number> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5000) {
      throw new Error('Replay cleanup batch size must be between 1 and 5000');
    }
    return this.prisma.$executeRaw`
      WITH expired AS (
        SELECT "id"
        FROM "GuestConversionReplay"
        WHERE "expiresAt" <= NOW() AND "responseCiphertext" IS NOT NULL
        ORDER BY "expiresAt" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "GuestConversionReplay" AS replay
      SET "responseCiphertext" = NULL, "ciphertextPurgedAt" = NOW()
      FROM expired
      WHERE replay."id" = expired."id"
    `;
  }

  private enforceStartLimit(clientKey: string): void {
    const max = Number(this.config.get<string>('GUEST_START_MAX_ATTEMPTS', '10'));
    const windowMs = Number(this.config.get<string>('GUEST_START_WINDOW_SECONDS', '60')) * 1000;
    if (!Number.isSafeInteger(max) || max < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1000) {
      throw new Error('Invalid guest start rate-limit configuration');
    }
    this.enforceLimit(clientKey, max, windowMs, 'Guest start rate limit exceeded');
  }

  private enforceConversionLimit(guestId: string): void {
    const max = this.positiveInteger('GUEST_CONVERSION_MAX_ATTEMPTS', 5);
    const windowMs = this.positiveInteger('GUEST_CONVERSION_WINDOW_SECONDS', 3600) * 1000;
    this.enforceLimit(guestId, max, windowMs, 'Guest conversion rate limit exceeded');
  }

  private enforceLimit(key: string, max: number, windowMs: number, message: string): void {
    const now = Date.now();
    const current = this.attempts.get(key);
    if (this.attempts.size >= 10000) {
      for (const [entryKey, value] of this.attempts) if (value.resetAt <= now) this.attempts.delete(entryKey);
      if (this.attempts.size >= 10000 && !this.attempts.has(key)) {
        throw new HttpException('Guest identity limiter is at capacity', HttpStatus.TOO_MANY_REQUESTS);
      }
    }
    if (!current || current.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (current.count >= max) throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    current.count += 1;
  }

  private positiveInteger(key: string, fallback: number): number {
    const raw = this.config.get<string>(key);
    const value = raw === undefined || raw === '' ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`);
    return value;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
