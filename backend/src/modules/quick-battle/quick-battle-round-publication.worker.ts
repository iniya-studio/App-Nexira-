import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { QuickBattleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const POLL_INTERVAL_MS = 500;
const MAX_MATCHES_PER_POLL = 10;
type Candidate = { id: string };

@Injectable()
export class QuickBattleRoundPublicationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QuickBattleRoundPublicationWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(matchId?: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const candidates = await tx.$queryRaw<Candidate[]>`
        SELECT match."id"
        FROM "QuickBattleMatch" AS match
        INNER JOIN "QuickBattleRound" AS next_round
          ON next_round."matchId" = match."id"
          AND next_round."roundNumber" = match."currentRound" + 1
        WHERE match."status" IN ('READY', 'ACTIVE')
          AND (${matchId ?? null}::uuid IS NULL OR match."id" = ${matchId ?? null}::uuid)
          AND match."currentRound" < match."roundsTarget"
          AND next_round."questionId" IS NOT NULL
          AND next_round."startedAt" IS NULL
          AND next_round."completedAt" IS NULL
          AND next_round."voidedAt" IS NULL
          AND (
            match."currentRound" = 0
            OR EXISTS (
              SELECT 1 FROM "QuickBattleRound" AS previous_round
              WHERE previous_round."matchId" = match."id"
                AND previous_round."roundNumber" = match."currentRound"
                AND previous_round."completedAt" IS NOT NULL
                AND previous_round."voidedAt" IS NULL
            )
          )
        ORDER BY match."createdAt" ASC
        LIMIT 1
        FOR UPDATE OF match SKIP LOCKED
      `;
      const claimedMatchId = candidates[0]?.id;
      if (!claimedMatchId) return false;
      const match = await tx.quickBattleMatch.findUnique({
        where: { id: claimedMatchId },
        select: { id: true, status: true, currentRound: true, roundsTarget: true, startedAt: true },
      });
      if (!match || (match.status !== QuickBattleStatus.READY && match.status !== QuickBattleStatus.ACTIVE) ||
          match.currentRound >= match.roundsTarget) return false;
      const nextRoundNumber = match.currentRound + 1;
      const round = await tx.quickBattleRound.findUnique({
        where: { matchId_roundNumber: { matchId: claimedMatchId, roundNumber: nextRoundNumber } },
        select: {
          id: true, questionId: true, startedAt: true, completedAt: true, voidedAt: true,
          question: { select: { timeLimitSeconds: true } },
        },
      });
      if (!round || !round.questionId || !round.question || round.startedAt || round.completedAt || round.voidedAt) {
        return false;
      }
      const clock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      const startedAt = clock[0]?.now;
      if (!(startedAt instanceof Date) || Number.isNaN(startedAt.getTime())) {
        throw new Error('Database clock did not return a valid publication timestamp');
      }
      const deadlineAt = new Date(startedAt.getTime() + round.question.timeLimitSeconds * 1000);
      const updated = await tx.quickBattleRound.updateMany({
        where: { id: round.id, matchId: claimedMatchId, questionId: { not: null }, startedAt: null, completedAt: null, voidedAt: null },
        data: { startedAt, deadlineAt },
      });
      if (updated.count !== 1) return false;
      const matchUpdated = await tx.quickBattleMatch.updateMany({
        where: { id: claimedMatchId, currentRound: match.currentRound, status: match.status },
        data: {
          status: QuickBattleStatus.ACTIVE,
          currentRound: nextRoundNumber,
          startedAt: match.startedAt ?? startedAt,
        },
      });
      if (matchUpdated.count !== 1) throw new Error('Quick Battle match changed during round publication');
      return true;
    });
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (let index = 0; index < MAX_MATCHES_PER_POLL; index += 1) {
        if (!(await this.runOnce())) break;
      }
    } catch (error) {
      this.logger.error('Quick Battle round publication failed',
        error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.polling = false;
    }
  }
}
