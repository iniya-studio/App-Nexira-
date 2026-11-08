import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const POLL_INTERVAL_MS = 1_000;
const MAX_ROUNDS_PER_POLL = 10;

type FinalizableRound = { id: string };

@Injectable()
export class RoundFinalizationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoundFinalizationWorker.name);
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
   * Completes a round early only when every active match participant has an
   * accepted answer and every submitted answer has a final judge state.
   * Deadline/no-response settlement remains owned by RoundDeadlineWorker.
   */
  async runOnce(): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Match -> Round is the same lock order used by startNextRound.
      const candidates = await tx.$queryRawUnsafe<FinalizableRound[]>(
        'SELECT r."id" ' +
          'FROM "Round" r ' +
          'INNER JOIN "Match" m ON m."id" = r."matchId" ' +
          'WHERE r."completedAt" IS NULL ' +
          'AND r."deadlineAt" > clock_timestamp() ' +
          'AND m."status" = \'ACTIVE\' ' +
          'AND m."currentRound" = r."roundNumber" ' +
          'AND (SELECT COUNT(*) FROM "MatchParticipant" mp ' +
          'WHERE mp."matchId" = m."id" AND mp."status" IN (\'ACTIVE\', \'DISCONNECTED\')) = 2 ' +
          'AND NOT EXISTS (SELECT 1 FROM "MatchParticipant" mp ' +
          'WHERE mp."matchId" = m."id" AND mp."status" IN (\'ACTIVE\', \'DISCONNECTED\') ' +
          'AND NOT EXISTS (SELECT 1 FROM "Answer" a ' +
          'WHERE a."roundId" = r."id" AND a."participantId" = mp."id" ' +
          'AND a."status" = \'ANSWERED\')) ' +
          'AND NOT EXISTS (SELECT 1 FROM "Answer" a WHERE a."roundId" = r."id" ' +
          'AND (a."status" <> \'ANSWERED\' OR a."judgeStatus" NOT IN (\'COMPLETED\', \'NOT_REQUIRED\'))) ' +
          'ORDER BY r."deadlineAt" ASC LIMIT 1 FOR UPDATE OF m, r SKIP LOCKED',
      );

      const roundId = candidates[0]?.id;
      if (!roundId) return false;

      const timestamp = await tx.$queryRawUnsafe<Array<{ now: Date }>>(
        'SELECT clock_timestamp() AS "now"',
      );
      const completedAt = timestamp[0]?.now;
      if (!(completedAt instanceof Date) || Number.isNaN(completedAt.getTime())) {
        throw new Error('Database clock did not return a valid timestamp');
      }

      const result = await tx.round.updateMany({
        where: {
          id: roundId,
          completedAt: null,
          match: { status: MatchStatus.ACTIVE },
        },
        data: { completedAt },
      });

      return result.count === 1;
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
        'Round finalization processing failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      this.polling = false;
    }
  }
}
