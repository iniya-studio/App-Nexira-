import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AnswerStatus,
  JudgeStatus,
  MatchStatus,
  ParticipantStatus,
  ParticipantType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchSettlementService } from './match-settlement.service';

const POLL_INTERVAL_MS = 1_000;
const MAX_ROUNDS_PER_POLL = 5;
const FORFEIT_TRANSFER_POINTS = 20;

type DueRound = { id: string };

@Injectable()
export class RoundDeadlineWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoundDeadlineWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: MatchSettlementService,
  ) {}

  onModuleInit(): void {
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Processes one overdue round. Public for deterministic PostgreSQL integration tests. */
  async runOnce(): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // This constant SQL contains no user input. The Round lock serializes
      // timeout processing with answer submission and judge completion.
      const due = await tx.$queryRawUnsafe<DueRound[]>(
        'SELECT r."id" FROM "Round" r ' +
          'INNER JOIN "Match" m ON m."id" = r."matchId" ' +
          'WHERE r."completedAt" IS NULL ' +
          'AND r."voidedAt" IS NULL ' +
          'AND r."deadlineAt" <= clock_timestamp() ' +
          'AND m."status" = \'ACTIVE\' ' +
          'AND NOT EXISTS (SELECT 1 FROM "AiAnswerJob" ai_job ' +
          'WHERE ai_job."roundId" = r."id" AND ai_job."status" = \'FAILED\') ' +
          'AND NOT EXISTS (SELECT 1 FROM "Answer" a WHERE a."roundId" = r."id" ' +
          'AND a."status" = \'ANSWERED\' ' +
          'AND a."judgeStatus" IN (\'PENDING\', \'PROCESSING\', \'FAILED\')) ' +
          'ORDER BY r."deadlineAt" ASC LIMIT 1 FOR UPDATE OF r SKIP LOCKED',
      );

      const roundId = due[0]?.id;
      if (!roundId) return false;

      const round = await tx.round.findUnique({
        where: { id: roundId },
        include: {
          question: true,
          match: { include: { participants: true } },
          answers: {
            select: { participantId: true, status: true, judgeStatus: true },
          },
        },
      });

      if (
        !round ||
        !round.question ||
        round.completedAt ||
        round.match.status !== MatchStatus.ACTIVE ||
        !round.deadlineAt
      ) {
        return true;
      }

      if (
        round.answers.some(
          (answer) =>
            answer.status === AnswerStatus.ANSWERED &&
            answer.judgeStatus !== JudgeStatus.COMPLETED &&
            answer.judgeStatus !== JudgeStatus.NOT_REQUIRED,
        )
      ) {
        return true;
      }

      const answeredParticipantIds = new Set(
        round.answers.map((answer) => answer.participantId),
      );
      const missingParticipants = round.match.participants.filter(
        (participant) =>
          (participant.status === ParticipantStatus.ACTIVE ||
            participant.status === ParticipantStatus.DISCONNECTED) &&
          !answeredParticipantIds.has(participant.id),
      );

      const nowRows = await tx.$queryRawUnsafe<Array<{ now: Date }>>(
        'SELECT clock_timestamp() AS "now"',
      );
      const finalizedAt = nowRows[0]?.now;
      if (!(finalizedAt instanceof Date)) {
        throw new Error('Database clock did not return a valid timestamp');
      }

      // Close outstanding AI jobs under the round lock. A provider response
      // arriving after this point is fenced out and cannot alter the result.
      await tx.aiAnswerJob.updateMany({
        where: {
          roundId: round.id,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'CANCELLED',
          leaseId: null,
          leaseAt: null,
          completedAt: finalizedAt,
          lastErrorCode: 'ROUND_DEADLINE',
        },
      });

      const forfeited: Array<{ id: string }> = [];

      for (const participant of missingParticipants) {
        // Persist an explicit timeout outcome; absence of a row is never
        // interpreted as a no-response by downstream scoring or audit queries.
        await tx.answer.create({
          data: {
            matchId: round.matchId,
            roundId: round.id,
            participantId: participant.id,
            status: AnswerStatus.NO_RESPONSE,
            judgeStatus: JudgeStatus.NOT_REQUIRED,
            elapsedMs: round.question.timeLimitSeconds * 1000,
            points: 0,
            speedBonus: 0,
            idempotencyKey:
              'timeout:' + round.id + ':' + participant.id + ':v1',
            acceptedAt: round.deadlineAt,
          },
        });

        // The AI participant is not subject to human no-response penalties.
        if (participant.participantType !== ParticipantType.HUMAN) continue;

        const previousAnswers = await tx.$queryRawUnsafe<
          Array<{ status: AnswerStatus | null }>
        >(
          'SELECT a."status" FROM "Round" r ' +
            'LEFT JOIN "Answer" a ON a."roundId" = r."id" ' +
            'AND a."participantId" = $1::uuid ' +
            'WHERE r."matchId" = $2::uuid AND r."roundNumber" < $3 ' +
            'AND r."voidedAt" IS NULL ' +
            'ORDER BY r."roundNumber" DESC LIMIT 2',
          participant.id,
          round.matchId,
          round.roundNumber,
        );

        let previousStreak = 0;
        for (const previous of previousAnswers) {
          if (previous.status !== AnswerStatus.NO_RESPONSE) break;
          previousStreak += 1;
        }

        const streak = previousStreak + 1;
        const penalty = streak >= 3 ? 10 : 5;

        await tx.matchScoreEntry.create({
          data: {
            matchId: round.matchId,
            participantId: participant.id,
            roundId: round.id,
            entryType: 'NO_RESPONSE_PENALTY',
            pointsChange: -penalty,
            idempotencyKey:
              'round:' +
              round.id +
              ':participant:' +
              participant.id +
              ':no-response-penalty:v1',
          },
        });
        await tx.matchParticipant.update({
          where: { id: participant.id },
          data: { score: { decrement: penalty } },
        });

        if (streak >= 3) {
          await tx.matchParticipant.update({
            where: { id: participant.id },
            data: {
              status: ParticipantStatus.FORFEITED,
              finishedAt: finalizedAt,
            },
          });
          forfeited.push({ id: participant.id });
        }
      }

      await tx.round.update({
        where: { id: round.id },
        data: { completedAt: finalizedAt },
      });

      if (forfeited.length > 0) {
        const remaining = round.match.participants.filter(
          (participant) =>
            participant.status !== ParticipantStatus.FORFEITED &&
            !forfeited.some((item) => item.id === participant.id),
        );

        let winnerParticipantId: string | null = null;
        let outcome: string;
        const hasSingleForfeiter =
          forfeited.length === 1 && remaining.length === 1;

        if (hasSingleForfeiter) {
          const winner = remaining[0];
          winnerParticipantId = winner.id;
          outcome = 'CONSECUTIVE_NO_RESPONSE_FORFEIT';

          await tx.matchScoreEntry.create({
            data: {
              matchId: round.matchId,
              participantId: winner.id,
              roundId: round.id,
              entryType: 'FORFEIT_TRANSFER',
              pointsChange: FORFEIT_TRANSFER_POINTS,
              idempotencyKey:
                'match:' +
                round.matchId +
                ':forfeit:' +
                forfeited[0].id +
                ':transfer:v1',
            },
          });
          await tx.matchParticipant.update({
            where: { id: winner.id },
            data: { score: { increment: FORFEIT_TRANSFER_POINTS } },
          });
        } else {
          // Simultaneous third consecutive no-responses have no remaining
          // participant to receive a transfer. Resolve as a mutual-forfeit draw.
          outcome = 'MUTUAL_FORFEIT_DRAW';
        }

        const finalParticipants = await tx.matchParticipant.findMany({
          where: { matchId: round.matchId },
          select: { id: true, score: true },
        });

        await tx.matchParticipant.updateMany({
          where: {
            matchId: round.matchId,
            status: {
              in: [ParticipantStatus.ACTIVE, ParticipantStatus.DISCONNECTED],
            },
          },
          data: {
            status: ParticipantStatus.COMPLETED,
            finishedAt: finalizedAt,
          },
        });

        await tx.match.update({
          where: { id: round.matchId },
          data: {
            status: MatchStatus.COMPLETED,
            completedAt: finalizedAt,
          },
        });

        const summary: Prisma.InputJsonObject = {
          outcome,
          roundId: round.id,
          forfeitedParticipantIds: forfeited.map((item) => item.id),
          winnerParticipantId,
          transferPoints: hasSingleForfeiter ? FORFEIT_TRANSFER_POINTS : 0,
          finalScores: Object.fromEntries(
            finalParticipants.map((participant) => [
              participant.id,
              participant.score,
            ]),
          ),
        };

        await tx.matchResult.create({
          data: {
            matchId: round.matchId,
            winnerParticipantId,
            resultSummary: summary,
            completedAt: finalizedAt,
          },
        });
        await this.settlement.settleCompletedMatch(tx, round.matchId);
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
      this.logger.error(
        'Round deadline processing failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      this.polling = false;
    }
  }
}
