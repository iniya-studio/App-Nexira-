import {
  Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit,
} from '@nestjs/common';
import {
  AnswerStatus, JudgeStatus, MatchMode, MatchStatus, ParticipantStatus, ParticipantType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { judgeMultipleChoiceAnswer } from './scoring.policy';
import { AI_OPPONENT_ANSWER, AiOpponentAnswer, AiOpponentOption } from './ai-opponent-answer.port';

const POLL_INTERVAL_MS = 500;
const MAX_JOBS_PER_POLL = 5;
const STALE_LEASE_SECONDS = 30;

type AiAnswerClaim = {
  id: string; matchId: string; roundId: string; participantId: string;
  attempts: number; leaseId: string;
};
type StoredOption = { id: string; text: string };

@Injectable()
export class AiOpponentAnswerWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiOpponentAnswerWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_OPPONENT_ANSWER) private readonly opponent: AiOpponentAnswer,
  ) {}

  onModuleInit(): void {
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<boolean> {
    const claim = await this.claimNextJob();
    if (!claim) return false;

    try {
      const round = await this.prisma.round.findFirst({
        where: { id: claim.roundId, matchId: claim.matchId },
        select: {
          startedAt: true, deadlineAt: true, completedAt: true, voidedAt: true,
          question: { select: {
            answerType: true, canonicalPrompt: true, canonicalOptions: true,
          } },
          match: { select: { mode: true, status: true } },
        },
      });

      if (
        !round?.question || !round.startedAt || !round.deadlineAt ||
        round.completedAt || round.voidedAt ||
        round.match.mode !== MatchMode.ONE_V_AI ||
        round.match.status !== MatchStatus.ACTIVE
      ) {
        await this.cancelClaim(claim, 'AI_ANSWER_SOURCE_INVALID');
        return true;
      }

      const answerType = round.question.answerType;
      if (answerType !== 'MULTIPLE_CHOICE' && answerType !== 'FREE_TEXT') {
        await this.releaseClaim(claim, 'AI_ANSWER_TYPE_UNSUPPORTED');
        return true;
      }
      const options = this.readOptions(round.question.canonicalOptions);
      if (answerType === 'MULTIPLE_CHOICE' && options.length < 2) {
        await this.releaseClaim(claim, 'AI_ANSWER_OPTIONS_INVALID');
        return true;
      }

      const responseText = await this.opponent.generateAnswer({
        answerType, question: round.question.canonicalPrompt, options,
      });
      if (
        !responseText.trim() || responseText.length > 2000 ||
        (answerType === 'MULTIPLE_CHOICE' &&
          !options.some((option) => option.id === responseText.trim()))
      ) throw new Error('AI_ANSWER_PROVIDER_RESULT_INVALID');

      await this.persistAnswer(claim, responseText.trim(), answerType);
    } catch (error) {
      const code = error instanceof Error
        ? error.message.slice(0, 64)
        : 'AI_ANSWER_INTERNAL_ERROR';
      await this.releaseClaim(claim, code);
      this.logger.warn(`AI opponent answer attempt failed: ${code}`);
    }
    return true;
  }

  private readOptions(value: unknown): AiOpponentOption[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (
        typeof item !== 'object' || item === null || Array.isArray(item) ||
        typeof (item as Record<string, unknown>).id !== 'string' ||
        typeof (item as Record<string, unknown>).text !== 'string'
      ) return [];
      const option = item as StoredOption;
      return option.id.trim() && option.text.trim()
        ? [{ id: option.id, text: option.text }]
        : [];
    });
  }

  private async claimNextJob(): Promise<AiAnswerClaim | null> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<AiAnswerClaim[]>`
        WITH candidate AS (
          SELECT job."id"
          FROM "AiAnswerJob" job
          INNER JOIN "Round" round
            ON round."id" = job."roundId" AND round."matchId" = job."matchId"
          INNER JOIN "Match" match ON match."id" = job."matchId"
          INNER JOIN "MatchParticipant" participant
            ON participant."id" = job."participantId"
            AND participant."matchId" = job."matchId"
          WHERE job."attempts" < job."maxAttempts"
            AND (
              (job."status" = 'PENDING' AND job."availableAt" <= clock_timestamp())
              OR
              (job."status" = 'PROCESSING' AND job."leaseAt" <=
                clock_timestamp() - (${STALE_LEASE_SECONDS} * INTERVAL '1 second'))
            )
            AND round."startedAt" IS NOT NULL
            AND round."deadlineAt" > clock_timestamp()
            AND round."completedAt" IS NULL AND round."voidedAt" IS NULL
            AND match."mode" = 'ONE_V_AI' AND match."status" = 'ACTIVE'
            AND participant."participantType" = 'AI'
            AND participant."status" IN ('ACTIVE', 'DISCONNECTED')
            AND NOT EXISTS (
              SELECT 1 FROM "Answer" answer
              WHERE answer."roundId" = round."id"
                AND answer."participantId" = participant."id"
            )
          ORDER BY job."availableAt" ASC, job."createdAt" ASC
          LIMIT 1 FOR UPDATE OF job SKIP LOCKED
        )
        UPDATE "AiAnswerJob" job
        SET "status" = 'PROCESSING', "attempts" = job."attempts" + 1,
            "leaseId" = gen_random_uuid(), "leaseAt" = clock_timestamp()
        FROM candidate
        WHERE job."id" = candidate."id"
        RETURNING job."id", job."matchId", job."roundId",
          job."participantId", job."attempts", job."leaseId"
      `;
      return rows[0] ?? null;
    });
  }

  private async persistAnswer(
    claim: AiAnswerClaim,
    responseText: string,
    answerType: 'MULTIPLE_CHOICE' | 'FREE_TEXT',
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Round"
        WHERE "id" = ${claim.roundId}::uuid AND "matchId" = ${claim.matchId}::uuid
        FOR UPDATE
      `;
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "AiAnswerJob" WHERE "id" = ${claim.id}::uuid FOR UPDATE
      `;

      const current = await tx.$queryRaw<Array<{
        status: string; leaseId: string | null; leaseAt: Date | null;
      }>>`
        SELECT "status", "leaseId", "leaseAt"
        FROM "AiAnswerJob" WHERE "id" = ${claim.id}::uuid
      `;
      const clock = await tx.$queryRaw<Array<{ now: Date }>>`
        SELECT clock_timestamp() AS "now"
      `;
      const now = clock[0]?.now;
      const lease = current[0];
      if (
        !lease || lease.status !== 'PROCESSING' ||
        lease.leaseId !== claim.leaseId || !lease.leaseAt ||
        !(now instanceof Date) ||
        lease.leaseAt.getTime() <= now.getTime() - STALE_LEASE_SECONDS * 1000
      ) return;

      const round = await tx.round.findFirst({
        where: { id: claim.roundId, matchId: claim.matchId },
        select: {
          startedAt: true, deadlineAt: true, completedAt: true, voidedAt: true,
          question: { select: { answerKey: true } },
          match: { select: { mode: true, status: true } },
          answers: { where: { participantId: claim.participantId }, select: { id: true } },
        },
      });
      if (
        !round?.startedAt || !round.deadlineAt || round.completedAt || round.voidedAt ||
        round.match.mode !== MatchMode.ONE_V_AI || round.match.status !== MatchStatus.ACTIVE ||
        now.getTime() >= round.deadlineAt.getTime()
      ) {
        await tx.$executeRaw`
          UPDATE "AiAnswerJob" SET "status" = 'CANCELLED', "leaseId" = NULL,
            "leaseAt" = NULL, "completedAt" = clock_timestamp(), "lastErrorCode" = 'ROUND_CLOSED'
          WHERE "id" = ${claim.id}::uuid AND "leaseId" = ${claim.leaseId}::uuid
        `;
        return;
      }
      if (round.answers.length > 0) {
        await tx.$executeRaw`
          UPDATE "AiAnswerJob" SET "status" = 'COMPLETED', "leaseId" = NULL,
            "leaseAt" = NULL, "completedAt" = clock_timestamp(), "lastErrorCode" = NULL
          WHERE "id" = ${claim.id}::uuid AND "leaseId" = ${claim.leaseId}::uuid
        `;
        return;
      }

      const participant = await tx.matchParticipant.findFirst({
        where: {
          id: claim.participantId, matchId: claim.matchId,
          participantType: ParticipantType.AI,
          status: { in: [ParticipantStatus.ACTIVE, ParticipantStatus.DISCONNECTED] },
        },
        select: { id: true },
      });
      if (!participant || !round.question) {
        await tx.$executeRaw`
          UPDATE "AiAnswerJob" SET "status" = 'CANCELLED', "leaseId" = NULL,
            "leaseAt" = NULL, "completedAt" = clock_timestamp(),
            "lastErrorCode" = 'AI_PARTICIPANT_UNAVAILABLE'
          WHERE "id" = ${claim.id}::uuid AND "leaseId" = ${claim.leaseId}::uuid
        `;
        return;
      }

      const elapsedMs = Math.max(0, now.getTime() - round.startedAt.getTime());
      const mcq = answerType === 'MULTIPLE_CHOICE'
        ? judgeMultipleChoiceAnswer(responseText, round.question.answerKey, elapsedMs)
        : null;
      const answer = await tx.answer.create({
        data: {
          matchId: claim.matchId, roundId: claim.roundId,
          participantId: claim.participantId, responseText,
          status: AnswerStatus.ANSWERED,
          judgeStatus: mcq ? JudgeStatus.COMPLETED : JudgeStatus.PENDING,
          decision: mcq?.decision ?? null, confidence: mcq ? 1 : null,
          points: mcq?.points ?? 0, speedBonus: mcq?.speedBonus ?? 0,
          judgeReason: mcq?.judgeReason ?? null, judgeVersion: mcq?.judgeVersion ?? null,
          elapsedMs,
          idempotencyKey: `ai-answer:${claim.roundId}:${claim.participantId}:v1`,
          acceptedAt: now,
        },
      });

      if (mcq && mcq.points > 0) {
        await tx.matchScoreEntry.create({
          data: {
            matchId: claim.matchId, participantId: claim.participantId,
            roundId: claim.roundId, answerId: answer.id,
            entryType: 'ANSWER_SCORE', pointsChange: mcq.points,
            idempotencyKey: `answer:${answer.id}:score:v1`,
          },
        });
        await tx.matchParticipant.update({
          where: { id: claim.participantId },
          data: { score: { increment: mcq.points } },
        });
      }

      await tx.$executeRaw`
        UPDATE "AiAnswerJob" SET "status" = 'COMPLETED', "leaseId" = NULL,
          "leaseAt" = NULL, "completedAt" = clock_timestamp(), "lastErrorCode" = NULL
        WHERE "id" = ${claim.id}::uuid AND "leaseId" = ${claim.leaseId}::uuid
      `;
    });
  }

  private async cancelClaim(claim: AiAnswerClaim, reason: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "AiAnswerJob" SET "status" = 'CANCELLED', "leaseId" = NULL,
        "leaseAt" = NULL, "completedAt" = clock_timestamp(), "lastErrorCode" = ${reason}
      WHERE "id" = ${claim.id}::uuid AND "leaseId" = ${claim.leaseId}::uuid
    `;
  }

  private async releaseClaim(claim: AiAnswerClaim, errorCode: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "AiAnswerJob"
      SET
        "status" = CASE WHEN "attempts" >= "maxAttempts"
          THEN 'FAILED'::"AiAnswerJobStatus" ELSE 'PENDING'::"AiAnswerJobStatus" END,
        "availableAt" = clock_timestamp() +
          (LEAST(1000 * POWER(2, GREATEST(0, "attempts" - 1)), 8000) * INTERVAL '1 millisecond'),
        "leaseId" = NULL, "leaseAt" = NULL, "lastErrorCode" = ${errorCode}
      WHERE "id" = ${claim.id}::uuid AND "status" = 'PROCESSING'
        AND "leaseId" = ${claim.leaseId}::uuid
    `;
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (let index = 0; index < MAX_JOBS_PER_POLL; index += 1) {
        if (!(await this.runOnce())) break;
      }
    } catch (error) {
      this.logger.error(
        'AI opponent answer polling failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      this.polling = false;
    }
  }
}
