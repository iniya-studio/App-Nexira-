import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { MatchStatus, MatchScoreEntryType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { questionGenerationInputForMatch } from './question-generation.context';

const POLL_INTERVAL_MS = 1_000;
const MAX_ROUNDS_PER_POLL = 5;
const TECHNICAL_VOID_REASON = 'AI_JUDGE_RETRY_EXHAUSTED';

type FailedRound = { id: string };

@Injectable()
export class RoundTechnicalVoidWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoundTechnicalVoidWorker.name);
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

  /**
   * Voids one round only after at least one AI adjudication is terminally
   * failed and every other submitted answer has left PENDING/PROCESSING.
   * The Round lock is shared with answer submission, judge completion,
   * deadline settlement, and early finalization.
   */
  async runOnce(): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const candidates = await tx.$queryRawUnsafe<FailedRound[]>(
        'SELECT r."id" ' +
          'FROM "Round" r ' +
          'INNER JOIN "Match" m ON m."id" = r."matchId" ' +
          'WHERE r."completedAt" IS NULL ' +
          'AND r."voidedAt" IS NULL ' +
          'AND m."status" = \'ACTIVE\' ' +
          'AND m."currentRound" = r."roundNumber" ' +
          'AND EXISTS (SELECT 1 FROM "Answer" failed ' +
          'WHERE failed."roundId" = r."id" ' +
          'AND failed."status" = \'ANSWERED\' ' +
          'AND failed."judgeStatus" = \'FAILED\') ' +
          'AND NOT EXISTS (SELECT 1 FROM "Answer" pending ' +
          'WHERE pending."roundId" = r."id" ' +
          'AND pending."status" = \'ANSWERED\' ' +
          "AND pending.\"judgeStatus\" IN ('PENDING', 'PROCESSING')) " +
          'ORDER BY r."roundNumber" ASC LIMIT 1 FOR UPDATE OF r SKIP LOCKED',
      );

      const roundId = candidates[0]?.id;
      if (!roundId) return false;

      const round = await tx.round.findUnique({
        where: { id: roundId },
        include: {
          match: { select: { status: true, currentRound: true } },
          question: true,
          scoreEntries: {
            where: {
              entryType: MatchScoreEntryType.ANSWER_SCORE,
              pointsChange: { gt: 0 },
            },
            select: {
              id: true,
              participantId: true,
              pointsChange: true,
            },
          },
        },
      });

      if (
        !round ||
        !round.question ||
        round.completedAt ||
        round.voidedAt ||
        round.match.status !== MatchStatus.ACTIVE ||
        round.match.currentRound !== round.roundNumber
      ) {
        return true;
      }

      const nowRows = await tx.$queryRawUnsafe<Array<{ now: Date }>>(
        'SELECT clock_timestamp() AS "now"',
      );
      const voidedAt = nowRows[0]?.now;
      if (!(voidedAt instanceof Date) || Number.isNaN(voidedAt.getTime())) {
        throw new Error('Database clock did not return a valid timestamp');
      }

      // Preserve every original ledger row. Add one compensating entry for
      // each positive answer score and update the aggregate only when that
      // idempotent reversal is newly inserted.
      for (const entry of round.scoreEntries) {
        const reversal = await tx.matchScoreEntry.createMany({
          data: [
            {
              matchId: round.matchId,
              participantId: entry.participantId,
              roundId: round.id,
              entryType: MatchScoreEntryType.ROUND_VOID_REVERSAL,
              pointsChange: -entry.pointsChange,
              idempotencyKey: `round:${round.id}:void:reverse:${entry.id}:v1`,
            },
          ],
          skipDuplicates: true,
        });

        if (reversal.count === 1) {
          await tx.matchParticipant.update({
            where: { id: entry.participantId },
            data: { score: { decrement: entry.pointsChange } },
          });
        }
      }

      await tx.round.update({
        where: { id: round.id },
        data: {
          voidedAt,
          completedAt: voidedAt,
          voidReason: TECHNICAL_VOID_REASON,
        },
      });

      const matchReady = await tx.match.updateMany({
        where: {
          id: round.matchId,
          status: MatchStatus.ACTIVE,
          currentRound: round.roundNumber,
        },
        data: { status: MatchStatus.READY },
      });
      if (matchReady.count !== 1) {
        throw new Error(
          'Match state changed while voiding the technical round',
        );
      }

      const answerType = round.question.answerType;
      if (answerType !== 'MULTIPLE_CHOICE' && answerType !== 'FREE_TEXT') {
        throw new Error('Voided round question has an unsupported answer type');
      }
      const requestContext = await questionGenerationInputForMatch(
        tx,
        round.matchId,
        {
          category: round.question.category,
          difficulty: round.question.difficulty,
          language: round.question.canonicalLanguage,
          answerType,
          timeLimitSeconds: round.question.timeLimitSeconds,
        },
      );
      await tx.questionGenerationJob.create({
        data: {
          matchId: round.matchId,
          sourceRoundId: round.id,
          status: 'PENDING',
          triggerReason: TECHNICAL_VOID_REASON,
          requestContext,
          maxAttempts: 3,
          idempotencyKey: `round:${round.id}:question-generation:v1`,
        },
      });

      this.logger.warn(
        `Round ${round.id} voided: ${TECHNICAL_VOID_REASON}; ${round.scoreEntries.length} score entries checked for reversal; replacement generation queued`,
      );
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
      this.logger.error(
        'Technical round-void worker failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      this.polling = false;
    }
  }
}
