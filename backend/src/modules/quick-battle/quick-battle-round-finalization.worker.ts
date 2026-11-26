import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AnswerStatus, JudgeStatus, QuickBattleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const POLL_INTERVAL_MS = 500;
const MAX_ROUNDS_PER_POLL = 10;
type DueRound = { matchId: string; roundId: string };

@Injectable()
export class QuickBattleRoundFinalizationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QuickBattleRoundFinalizationWorker.name);
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
      const candidates = await tx.$queryRaw<DueRound[]>`
        SELECT match."id" AS "matchId", round."id" AS "roundId"
        FROM "QuickBattleMatch" AS match
        INNER JOIN "QuickBattleRound" AS round
          ON round."matchId" = match."id"
          AND round."roundNumber" = match."currentRound"
        WHERE match."status" = 'ACTIVE'
          AND (${matchId ?? null}::uuid IS NULL OR match."id" = ${matchId ?? null}::uuid)
          AND round."startedAt" IS NOT NULL
          AND round."deadlineAt" IS NOT NULL
          AND round."completedAt" IS NULL
          AND round."voidedAt" IS NULL
          AND (
            EXISTS (
              SELECT 1 FROM "QuickBattleAnswer" AS answer
              WHERE answer."roundId" = round."id"
                AND (
                  (answer."status" = 'ANSWERED' AND answer."judgeStatus" = 'COMPLETED')
                  OR answer."status" = 'NO_RESPONSE'
                )
            )
            OR (
              round."deadlineAt" <= clock_timestamp()
              AND NOT EXISTS (
                SELECT 1 FROM "QuickBattleAnswer" AS answer
                WHERE answer."roundId" = round."id"
              )
            )
          )
        ORDER BY round."deadlineAt" ASC
        LIMIT 1
        FOR UPDATE OF match SKIP LOCKED
      `;
      const candidate = candidates[0];
      if (!candidate) return false;
      await tx.$queryRaw`SELECT "id" FROM "QuickBattleRound" WHERE "id" = ${candidate.roundId}::uuid FOR UPDATE`;

      const match = await tx.quickBattleMatch.findUnique({
        where: { id: candidate.matchId },
        select: { id: true, status: true, currentRound: true, roundsTarget: true },
      });
      const round = await tx.quickBattleRound.findUnique({
        where: { id: candidate.roundId },
        select: {
          id: true, roundNumber: true, deadlineAt: true, completedAt: true, voidedAt: true,
          question: { select: { timeLimitSeconds: true } },
          answer: { select: { id: true, status: true, judgeStatus: true } },
        },
      });
      if (!match || match.status !== QuickBattleStatus.ACTIVE || !round ||
          match.currentRound !== round.roundNumber || !round.question ||
          round.completedAt || round.voidedAt || !round.deadlineAt) return false;

      const clock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      const now = clock[0]?.now;
      if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
        throw new Error('Database clock is unavailable');
      }

      if (!round.answer) {
        if (now.getTime() < round.deadlineAt.getTime()) return false;
        await tx.quickBattleAnswer.create({
          data: {
            matchId: match.id,
            roundId: round.id,
            responseText: null,
            status: AnswerStatus.NO_RESPONSE,
            judgeStatus: JudgeStatus.NOT_REQUIRED,
            elapsedMs: round.question.timeLimitSeconds * 1000,
            points: null,
            idempotencyKey: `quick-battle-timeout:${round.id}:v1`,
            acceptedAt: round.deadlineAt,
          },
        });
      } else if (
        round.answer.status === AnswerStatus.ANSWERED &&
        round.answer.judgeStatus !== JudgeStatus.COMPLETED
      ) {
        return false;
      }

      const completed = await tx.quickBattleRound.updateMany({
        where: { id: round.id, completedAt: null, voidedAt: null },
        data: { completedAt: now },
      });
      if (completed.count !== 1) return false;

      if (round.roundNumber === match.roundsTarget) {
        await tx.quickBattleMatch.updateMany({
          where: { id: match.id, status: QuickBattleStatus.ACTIVE, currentRound: round.roundNumber },
          data: { status: QuickBattleStatus.COMPLETED, completedAt: now },
        });
      }
      return true;
    });
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (let index = 0; index < MAX_ROUNDS_PER_POLL; index += 1) {
        if (!(await this.runOnce())) break;
      }
    } catch (error) {
      this.logger.error('Quick Battle round finalization failed',
        error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.polling = false;
    }
  }
}
