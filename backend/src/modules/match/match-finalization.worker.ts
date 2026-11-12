import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MatchStatus, ParticipantStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// V1 match length is centralized for future mode-specific policies.
export const V1_MATCH_ROUNDS = 5;
const POLL_INTERVAL_MS = 1_000;
const MAX_MATCHES_PER_POLL = 10;
type FinalizableMatch = { id: string };

@Injectable()
export class MatchFinalizationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchFinalizationWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit(): void { void this.poll(); this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS); }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async runOnce(): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const candidates = await tx.$queryRawUnsafe<FinalizableMatch[]>(
        'SELECT m."id" FROM "Match" m ' +
        'INNER JOIN "Round" r ON r."matchId" = m."id" AND r."roundNumber" = m."currentRound" ' +
        'WHERE m."status" = \'ACTIVE\' AND m."currentRound" >= $1 ' +
        'AND r."completedAt" IS NOT NULL AND r."voidedAt" IS NULL ' +
        'AND NOT EXISTS (SELECT 1 FROM "MatchResult" result WHERE result."matchId" = m."id") ' +
        'ORDER BY r."completedAt" ASC LIMIT 1 FOR UPDATE OF m SKIP LOCKED',
        V1_MATCH_ROUNDS,
      );
      const matchId = candidates[0]?.id;
      if (!matchId) return false;
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: {
          participants: { select: { id: true, score: true, status: true } },
          rounds: { where: { roundNumber: { lte: V1_MATCH_ROUNDS } }, select: { roundNumber: true, completedAt: true, voidedAt: true }, orderBy: { roundNumber: 'asc' } },
        },
      });
      if (!match || match.status !== MatchStatus.ACTIVE) return false;
      const validRounds = match.rounds.filter((round) => round.completedAt !== null && round.voidedAt === null);
      if (validRounds.length !== V1_MATCH_ROUNDS || validRounds.some((round, index) => round.roundNumber !== index + 1)) return false;
      const participants = match.participants;
      if (participants.length !== 2 || participants.some((p) => p.status === ParticipantStatus.FORFEITED)) return false;
      const [first, second] = participants;
      const winnerParticipantId = first.score === second.score ? null : first.score > second.score ? first.id : second.id;
      const completedAt = new Date();
      await tx.matchParticipant.updateMany({
        where: { matchId, status: { in: [ParticipantStatus.ACTIVE, ParticipantStatus.DISCONNECTED] } },
        data: { status: ParticipantStatus.COMPLETED, finishedAt: completedAt },
      });
      const updated = await tx.match.updateMany({
        where: { id: matchId, status: MatchStatus.ACTIVE, completedAt: null },
        data: { status: MatchStatus.COMPLETED, completedAt },
      });
      if (updated.count !== 1) return false;
      const summary: Prisma.InputJsonObject = {
        outcome: winnerParticipantId ? 'SCORE_WIN' : 'DRAW',
        roundsPlayed: V1_MATCH_ROUNDS,
        winnerParticipantId,
        finalScores: { [first.id]: first.score, [second.id]: second.score },
      };
      await tx.matchResult.create({ data: { matchId, winnerParticipantId, resultSummary: summary, completedAt } });
      return true;
    });
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try { for (let i = 0; i < MAX_MATCHES_PER_POLL; i += 1) { if (!(await this.runOnce())) break; } }
    catch (error) { this.logger.error('Match finalization processing failed', error instanceof Error ? error.message : 'Unknown error'); }
    finally { this.polling = false; }
  }
}