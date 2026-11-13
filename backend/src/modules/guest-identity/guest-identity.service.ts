import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuestIdentityStatus, MatchStatus, PrincipalType, Prisma, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { SessionService } from '../session/session.service';
import { EmailVerificationService } from '../auth/email-verification.service';
import { GuestConversionDto } from './dto/guest-conversion.dto';

@Injectable()
export class GuestIdentityService {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

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

  async convert(principal: AuthenticatedPrincipal, input: GuestConversionDto) {
    if (principal.principalType !== PrincipalType.GUEST) {
      throw new ForbiddenException('Only an authenticated guest can be converted');
    }
    this.enforceConversionLimit(principal.principalId);

    const email = input.email.trim().toLowerCase();
    const username = input.username.trim().toLowerCase();
    const displayName = input.displayName.trim();
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: this.positiveInteger('ARGON2_MEMORY_COST_KIB', 19456),
      timeCost: this.positiveInteger('ARGON2_TIME_COST', 2),
      parallelism: this.positiveInteger('ARGON2_PARALLELISM', 1),
    });

    let converted: {
      user: { id: string; email: string | null; username: string; displayName: string; preferredLanguage: string; emailVerifiedAt: Date | null };
      session: Awaited<ReturnType<SessionService['createSessionInTransaction']>>;
    };
    try {
      converted = await this.prisma.$transaction(async (tx) => {
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
          select: { id: true, status: true, convertedToUserId: true },
        });
        if (!guest || guest.status !== GuestIdentityStatus.ACTIVE || guest.convertedToUserId) {
          throw new UnauthorizedException('Guest identity is no longer active');
        }

        const user = await tx.user.create({
          data: {
            email,
            username,
            displayName,
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
        return { user, session };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('An account with this email or username already exists');
      }
      throw error;
    }

    const delivery = await this.emailVerification.issueAndSend(converted.user.id);
    return {
      user: converted.user,
      ...converted.session,
      emailVerification: { required: true, verified: false, delivery },
    };
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
