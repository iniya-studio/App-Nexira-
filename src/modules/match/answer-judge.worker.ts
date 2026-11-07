import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AnswerStatus, JudgeDecision, JudgeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { calculateCorrectAnswerScore } from './scoring.policy';
import {
  FREE_TEXT_ANSWER_JUDGE,
  FreeTextAnswerJudge,
  FreeTextJudgeError,
} from './answer-judge.port';

const MAX_ATTEMPTS = 3;
const STALE_LEASE_SECONDS = 30;
const POLL_INTERVAL_MS = 1_000;
const MAX_JOBS_PER_POLL = 5;

type JudgeClaim = {
  id: string;
  attempts: number;
  leaseId: string;
};

@Injectable()
export class AnswerJudgeWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnswerJudgeWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FREE_TEXT_ANSWER_JUDGE)
    private readonly judge: FreeTextAnswerJudge,
  ) {}

  onModuleInit(): void {
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Claims and processes at most one free-text answer.
   * Public for deterministic integration testing; production polling calls it internally.
   */
  async runOnce(): Promise<boolean> {
    const claim = await this.claimNextAnswer();
    if (!claim) return false;

    try {
      const answer = await this.prisma.answer.findUnique({
        where: { id: claim.id },
        include: {
          round: {
            include: { question: true },
          },
        },
      });

      const question = answer?.round.question;
      if (
        !answer ||
        answer.status !== AnswerStatus.ANSWERED ||
        !question ||
        question.answerType !== 'FREE_TEXT'
      ) {
        await this.releaseClaim(claim, 'JUDGE_SOURCE_INVALID');
        return true;
      }

      const result = await this.judge.judge({
        canonicalQuestion: question.canonicalPrompt,
        language: question.canonicalLanguage,
        expectedAnswer: question.answerKey,
        gradingRubric: question.gradingRubric,
        participantResponse: answer.responseText ?? '',
      });

      await this.persistDecision(claim, answer, result);
    } catch (error) {
      const code =
        error instanceof FreeTextJudgeError
          ? error.code
          : 'JUDGE_INTERNAL_ERROR';
      await this.releaseClaim(claim, code);
      this.logger.warn(`AI Judge attempt failed: ${code}`);
    }

    return true;
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
        'AI Judge worker polling failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      this.polling = false;
    }
  }

  private async claimNextAnswer(): Promise<JudgeClaim | null> {
    return this.prisma.$transaction(async (tx) => {
      // A crashed worker's lease is recoverable after a bounded stale interval.
      await tx.$executeRaw`
        UPDATE "Answer"
        SET
          "judgeStatus" = 'FAILED',
          "judgeStartedAt" = NULL,
          "judgeLeaseId" = NULL,
          "judgeReason" = 'JUDGE_RETRY_EXHAUSTED'
        WHERE "status" = 'ANSWERED'
          AND "judgeAttempts" >= ${MAX_ATTEMPTS}
          AND (
            ("judgeStatus" = 'PENDING' AND "judgeAvailableAt" <= clock_timestamp())
            OR
            ("judgeStatus" = 'PROCESSING'
              AND "judgeStartedAt" <= clock_timestamp() - (${STALE_LEASE_SECONDS} * INTERVAL '1 second'))
          )
      `;

      const rows = await tx.$queryRaw<JudgeClaim[]>`
        WITH candidate AS (
          SELECT a."id"
          FROM "Answer" a
          INNER JOIN "Round" r
            ON r."id" = a."roundId" AND r."matchId" = a."matchId"
          INNER JOIN "Question" q ON q."id" = r."questionId"
          WHERE a."status" = 'ANSWERED'
            AND q."answerType" = 'FREE_TEXT'
            AND a."judgeAttempts" < ${MAX_ATTEMPTS}
            AND (
              (a."judgeStatus" = 'PENDING' AND a."judgeAvailableAt" <= clock_timestamp())
              OR
              (a."judgeStatus" = 'PROCESSING'
                AND a."judgeStartedAt" <= clock_timestamp() - (${STALE_LEASE_SECONDS} * INTERVAL '1 second'))
            )
          ORDER BY a."acceptedAt" ASC
          LIMIT 1
          FOR UPDATE OF a SKIP LOCKED
        )
        UPDATE "Answer" AS a
        SET
          "judgeStatus" = 'PROCESSING',
          "judgeAttempts" = a."judgeAttempts" + 1,
          "judgeStartedAt" = clock_timestamp(),
          "judgeLeaseId" = gen_random_uuid()
        FROM candidate
        WHERE a."id" = candidate."id"
        RETURNING
          a."id",
          a."judgeAttempts" AS "attempts",
          a."judgeLeaseId" AS "leaseId"
      `;

      return rows[0] ?? null;
    });
  }

  private async persistDecision(
    claim: JudgeClaim,
    answer: Prisma.AnswerGetPayload<{
      include: { round: { include: { question: true } } };
    }>,
    result: Awaited<ReturnType<FreeTextAnswerJudge['judge']>>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Serialize judge completion with answer submission and round finalization.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Round" WHERE "id" = ${answer.roundId}::uuid FOR UPDATE
      `;
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Answer" WHERE "id" = ${claim.id}::uuid FOR UPDATE
      `;

      const current = await tx.answer.findUnique({
        where: { id: claim.id },
        select: { judgeStatus: true, judgeLeaseId: true },
      });
      if (
        current?.judgeStatus !== JudgeStatus.PROCESSING ||
        current.judgeLeaseId !== claim.leaseId
      ) {
        return;
      }

      const judgeVersion = `${result.provider}:${result.model}:${result.policyVersion}`;
      if (result.decision === JudgeDecision.UNCERTAIN) {
        const exhausted = claim.attempts >= MAX_ATTEMPTS;
        await tx.answer.update({
          where: { id: claim.id },
          data: {
            judgeStatus: exhausted ? JudgeStatus.FAILED : JudgeStatus.PENDING,
            decision: JudgeDecision.UNCERTAIN,
            confidence: result.confidence,
            judgeReason: exhausted ? 'JUDGE_UNCERTAIN_RETRY_EXHAUSTED' : result.reasonCode,
            judgeVersion,
            points: 0,
            speedBonus: 0,
            judgeStartedAt: null,
            judgeLeaseId: null,
            judgeAvailableAt: new Date(Date.now() + this.retryDelayMs(claim.attempts)),
          },
        });
        return;
      }

      const score =
        result.decision === JudgeDecision.CORRECT
          ? calculateCorrectAnswerScore(answer.elapsedMs)
          : { basePoints: 0, speedBonus: 0, totalPoints: 0 };

      await tx.answer.update({
        where: { id: claim.id },
        data: {
          judgeStatus: JudgeStatus.COMPLETED,
          decision: result.decision,
          confidence: result.confidence,
          judgeReason: result.reasonCode,
          judgeVersion,
          points: score.totalPoints,
          speedBonus: score.speedBonus,
          judgeStartedAt: null,
          judgeLeaseId: null,
        },
      });

      if (score.totalPoints > 0) {
        await tx.matchParticipant.update({
          where: { id: answer.participantId },
          data: { score: { increment: score.totalPoints } },
        });
      }
    });
  }

  private async releaseClaim(claim: JudgeClaim, reasonCode: string): Promise<void> {
    const exhausted = claim.attempts >= MAX_ATTEMPTS;
    await this.prisma.answer.updateMany({
      where: {
        id: claim.id,
        judgeStatus: JudgeStatus.PROCESSING,
        judgeLeaseId: claim.leaseId,
      },
      data: {
        judgeStatus: exhausted ? JudgeStatus.FAILED : JudgeStatus.PENDING,
        judgeReason: exhausted ? 'JUDGE_RETRY_EXHAUSTED' : reasonCode,
        judgeStartedAt: null,
        judgeLeaseId: null,
        judgeAvailableAt: new Date(Date.now() + this.retryDelayMs(claim.attempts)),
      },
    });
  }

  private retryDelayMs(attempt: number): number {
    return Math.min(1_000 * 2 ** Math.max(0, attempt - 1), 8_000);
  }
}
