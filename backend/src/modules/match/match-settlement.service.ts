import { Injectable } from '@nestjs/common';
import {
  AnswerStatus,
  JudgeDecision,
  JudgeStatus,
  MatchMode,
  MatchStatus,
  ParticipantStatus,
  ParticipantType,
  RankingScope,
  RankingSeasonStatus,
  Prisma,
} from '@prisma/client';

const XP_PER_CORRECT_ANSWER = 2;
const XP_PER_INCORRECT_ANSWER = 1;
const XP_MATCH_COMPLETION = 10;
const XP_MATCH_WIN = 5;
const XP_MATCH_DRAW = 3;
const RANKING_WIN = 20;
const RANKING_DRAW = 10;

type Transaction = Prisma.TransactionClient;

@Injectable()
export class MatchSettlementService {
  async settleCompletedMatch(tx: Transaction, matchId: string): Promise<void> {
    const match = await tx.match.findUnique({
      where: { id: matchId },
      include: {
        result: true,
        participants: {
          include: {
            guestIdentity: { select: { id: true, convertedToUserId: true } },
            answers: { include: { round: { select: { voidedAt: true } } } },
          },
        },
      },
    });

    if (!match || match.status !== MatchStatus.COMPLETED || !match.completedAt || !match.result) {
      throw new Error('Cannot settle a match without an authoritative completed result');
    }

    const humanParticipants = match.participants.filter(
      (participant) => participant.participantType === ParticipantType.HUMAN,
    );
    if (humanParticipants.length === 0) return;

    const ordered = [...humanParticipants].sort((a, b) =>
      this.principalSortKey(a).localeCompare(this.principalSortKey(b)),
    );

    const resolved: Array<{
      participant: (typeof ordered)[number];
      userId: string | null;
      guestIdentityId: string | null;
    }> = [];

    for (const participant of ordered) {
      const owner = await this.resolveOwner(tx, participant.userId, participant.guestIdentityId);
      resolved.push({ participant, ...owner });
    }

    const userParticipantCounts = new Map<string, number>();
    for (const owner of resolved) {
      if (owner.userId) {
        userParticipantCounts.set(owner.userId, (userParticipantCounts.get(owner.userId) ?? 0) + 1);
      }
    }
    const duplicateUserIds = new Set(
      [...userParticipantCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([duplicateUserId]) => duplicateUserId),
    );

    const activeSeason =
      match.mode === MatchMode.ONE_V_ONE &&
      humanParticipants.length === 2 &&
      duplicateUserIds.size === 0 &&
      resolved.some((owner) => owner.userId !== null)
        ? await this.findActiveSeason(tx, match.completedAt)
        : null;

    for (const owner of resolved) {
      if (owner.userId && duplicateUserIds.has(owner.userId)) continue;
      const amount = this.calculateXp(owner.participant, match.result.winnerParticipantId);
      if (amount <= 0) continue;
      if (owner.userId) {
        await this.awardUserXp(tx, owner.userId, matchId, amount);
      } else if (owner.guestIdentityId) {
        await this.awardGuestXp(tx, owner.guestIdentityId, matchId, amount);
      }
    }

    if (
      match.mode !== MatchMode.ONE_V_ONE ||
      humanParticipants.length !== 2 ||
      duplicateUserIds.size > 0
    ) return;

    for (const owner of resolved) {
      if (!owner.userId) continue;
      const outcome = owner.participant.id === match.result.winnerParticipantId
        ? 'WIN'
        : match.result.winnerParticipantId === null
          ? 'DRAW'
          : 'LOSS';
      await this.awardRanking(tx, owner.userId, matchId, outcome, activeSeason?.id ?? null);
    }
  }

  private calculateXp(
    participant: {
      id: string;
      status: ParticipantStatus;
      answers: Array<{
        status: AnswerStatus;
        decision: JudgeDecision | null;
        judgeStatus: JudgeStatus;
        round: { voidedAt: Date | null };
      }>;
    },
    winnerParticipantId: string | null,
  ): number {
    let amount = 0;
    for (const answer of participant.answers) {
      if (
        answer.round.voidedAt !== null ||
        answer.status !== AnswerStatus.ANSWERED ||
        (answer.judgeStatus !== JudgeStatus.COMPLETED &&
          answer.judgeStatus !== JudgeStatus.NOT_REQUIRED)
      ) continue;
      if (answer.decision === JudgeDecision.CORRECT) amount += XP_PER_CORRECT_ANSWER;
      else if (answer.decision === JudgeDecision.INCORRECT) amount += XP_PER_INCORRECT_ANSWER;
    }

    if (participant.status === ParticipantStatus.COMPLETED) {
      amount += XP_MATCH_COMPLETION;
      if (winnerParticipantId === null) amount += XP_MATCH_DRAW;
      else if (participant.id === winnerParticipantId) amount += XP_MATCH_WIN;
    }
    return amount;
  }

  private async findActiveSeason(tx: Transaction, completedAt: Date) {
    const seasons = await tx.rankingSeason.findMany({
      where: {
        status: RankingSeasonStatus.ACTIVE,
        startsAt: { lte: completedAt },
        endsAt: { gt: completedAt },
      },
      select: { id: true },
      take: 2,
    });
    if (seasons.length > 1) {
      throw new Error('Multiple active ranking seasons overlap the match completion timestamp');
    }
    return seasons[0] ?? null;
  }

  private principalSortKey(participant: {
    userId: string | null;
    guestIdentityId: string | null;
  }): string {
    if (participant.userId) return `user:${participant.userId}`;
    if (participant.guestIdentityId) return `guest:${participant.guestIdentityId}`;
    return 'invalid:human-without-owner';
  }

  private async resolveOwner(
    tx: Transaction,
    userId: string | null,
    guestIdentityId: string | null,
  ): Promise<{ userId: string | null; guestIdentityId: string | null }> {
    if (userId) {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "User" WHERE "id" = $1::uuid FOR UPDATE',
        userId,
      );
      return { userId, guestIdentityId: null };
    }
    if (!guestIdentityId) throw new Error('Human match participant has no identity owner');

    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "GuestIdentity" WHERE "id" = $1::uuid FOR UPDATE',
      guestIdentityId,
    );
    const guest = await tx.guestIdentity.findUnique({
      where: { id: guestIdentityId },
      select: { id: true, convertedToUserId: true },
    });
    if (!guest) throw new Error('Guest identity for completed match participant was not found');
    if (guest.convertedToUserId) {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "User" WHERE "id" = $1::uuid FOR UPDATE',
        guest.convertedToUserId,
      );
      return { userId: guest.convertedToUserId, guestIdentityId: null };
    }
    return { userId: null, guestIdentityId };
  }

  private deriveProgress(totalXp: bigint): { level: number; currentLevelXp: number } {
    let remaining = totalXp;
    let level = 1;
    while (remaining >= BigInt(level) * 100n) {
      remaining -= BigInt(level) * 100n;
      level += 1;
    }
    return { level, currentLevelXp: Number(remaining) };
  }

  private async awardUserXp(
    tx: Transaction,
    userId: string,
    matchId: string,
    amount: number,
  ): Promise<void> {
    const idempotencyKey = `match:${matchId}:user:${userId}:xp:v1`;
    const existing = await tx.xPTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.userId !== userId || existing.matchId !== matchId || existing.amount !== amount || existing.reason !== 'MATCH_REWARD') {
        throw new Error('Conflicting registered-user XP settlement idempotency record');
      }
      return;
    }

    await tx.xPTransaction.create({
      data: { userId, matchId, amount, reason: 'MATCH_REWARD', idempotencyKey },
    });
    const progress = await tx.userProgress.findUnique({ where: { userId } });
    const totalXp = (progress?.totalXp ?? 0n) + BigInt(amount);
    const snapshot = this.deriveProgress(totalXp);
    if (progress) {
      await tx.userProgress.update({
        where: { userId },
        data: { totalXp, ...snapshot },
      });
    } else {
      await tx.userProgress.create({
        data: { userId, totalXp, ...snapshot },
      });
    }
  }

  private async awardGuestXp(
    tx: Transaction,
    guestIdentityId: string,
    matchId: string,
    amount: number,
  ): Promise<void> {
    const guest = await tx.guestIdentity.findUnique({
      where: { id: guestIdentityId },
      select: { convertedToUserId: true },
    });
    if (guest?.convertedToUserId) {
      await this.awardUserXp(tx, guest.convertedToUserId, matchId, amount);
      return;
    }

    const progress = await tx.guestProgress.findUnique({ where: { guestIdentityId } });
    if (progress?.transferredAt) {
      throw new Error('Guest progression was transferred but the guest has no converted user');
    }
    const idempotencyKey = `match:${matchId}:guest:${guestIdentityId}:xp:v1`;
    const existing = await tx.guestXPTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.guestIdentityId !== guestIdentityId || existing.matchId !== matchId || existing.amount !== amount || existing.reason !== 'MATCH_REWARD') {
        throw new Error('Conflicting guest XP settlement idempotency record');
      }
      return;
    }

    await tx.guestXPTransaction.create({
      data: { guestIdentityId, matchId, amount, reason: 'MATCH_REWARD', idempotencyKey },
    });
    const totalXp = (progress?.totalXp ?? 0n) + BigInt(amount);
    const snapshot = this.deriveProgress(totalXp);
    if (progress) {
      await tx.guestProgress.update({
        where: { guestIdentityId },
        data: { totalXp, ...snapshot },
      });
    } else {
      await tx.guestProgress.create({
        data: { guestIdentityId, totalXp, ...snapshot },
      });
    }
  }

  private async awardRanking(
    tx: Transaction,
    userId: string,
    matchId: string,
    outcome: 'WIN' | 'DRAW' | 'LOSS',
    seasonId: string | null,
  ): Promise<void> {
    const pointsChange = outcome === 'WIN' ? RANKING_WIN : outcome === 'DRAW' ? RANKING_DRAW : 0;
    const reason = outcome === 'WIN' ? 'MATCH_WIN' : outcome === 'DRAW' ? 'MATCH_DRAW' : 'MATCH_LOSS';
    await this.awardRankingScope(tx, userId, matchId, RankingScope.GLOBAL, null, pointsChange, reason);
    if (seasonId) {
      await this.awardRankingScope(tx, userId, matchId, RankingScope.SEASON, seasonId, pointsChange, reason);
    }
  }

  private async awardRankingScope(
    tx: Transaction,
    userId: string,
    matchId: string,
    scope: RankingScope,
    seasonId: string | null,
    pointsChange: number,
    reason: string,
  ): Promise<void> {
    if ((scope === RankingScope.GLOBAL) !== (seasonId === null)) {
      throw new Error('Ranking scope and seasonId are inconsistent');
    }
    const suffix = scope === RankingScope.GLOBAL ? 'GLOBAL' : `SEASON:${seasonId}`;
    const idempotencyKey = `match:${matchId}:user:${userId}:ranking:${suffix}:v1`;
    const existing = await tx.rankingTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (
        existing.userId !== userId ||
        existing.matchId !== matchId ||
        existing.scope !== scope ||
        existing.seasonId !== seasonId ||
        existing.pointsChange !== pointsChange ||
        existing.reason !== reason
      ) {
        throw new Error('Conflicting ranking settlement idempotency record');
      }
      return;
    }

    await tx.rankingTransaction.create({
      data: { userId, matchId, scope, seasonId, pointsChange, reason, idempotencyKey },
    });
    const increment = {
      rankingPoints: { increment: pointsChange },
      wins: { increment: outcomeCount(reason, 'MATCH_WIN') },
      losses: { increment: outcomeCount(reason, 'MATCH_LOSS') },
      draws: { increment: outcomeCount(reason, 'MATCH_DRAW') },
      matchesPlayed: { increment: 1 },
    };
    if (scope === RankingScope.GLOBAL) {
      await tx.globalUserRanking.upsert({
        where: { userId },
        create: {
          userId,
          rankingPoints: pointsChange,
          wins: outcomeCount(reason, 'MATCH_WIN'),
          losses: outcomeCount(reason, 'MATCH_LOSS'),
          draws: outcomeCount(reason, 'MATCH_DRAW'),
          matchesPlayed: 1,
        },
        update: increment,
      });
    } else {
      if (!seasonId) throw new Error('Seasonal ranking requires a season ID');
      await tx.userRanking.upsert({
        where: { userId_seasonId: { userId, seasonId } },
        create: {
          userId,
          seasonId,
          rankingPoints: pointsChange,
          wins: outcomeCount(reason, 'MATCH_WIN'),
          losses: outcomeCount(reason, 'MATCH_LOSS'),
          draws: outcomeCount(reason, 'MATCH_DRAW'),
          matchesPlayed: 1,
        },
        update: increment,
      });
    }
  }
}

function outcomeCount(reason: string, expected: string): number {
  return reason === expected ? 1 : 0;
}
