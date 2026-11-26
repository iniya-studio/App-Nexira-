import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AnswerStatus, JudgeDecision, JudgeStatus, Prisma, QuickBattleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FREE_TEXT_ANSWER_JUDGE,
  FreeTextAnswerJudge,
  FreeTextJudgeError,
} from '../match/answer-judge.port';

const MAX_ATTEMPTS = 3;
const STALE_LEASE_SECONDS = 30;
const POLL_INTERVAL_MS = 1_000;
const MAX_JOBS_PER_POLL = 5;
type JudgeClaim = { id: string; matchId: string; roundId: string; attempts: number; leaseId: string };

@Injectable()
export class QuickBattleAnswerJudgeWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QuickBattleAnswerJudgeWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FREE_TEXT_ANSWER_JUDGE) private readonly judge: FreeTextAnswerJudge,
  ) {}

  onModuleInit(): void {
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(matchId?: string): Promise<boolean> {
    await this.recoverExhaustedLeases();
    const claim = await this.claimNextAnswer(matchId);
    if (!claim) return false;
    try {
      const answer = await this.prisma.quickBattleAnswer.findUnique({
        where: { id: claim.id },
        include: {
          match: { select: { language: true, status: true } },
          round: { include: { question: true } },
        },
      });
      const question = answer?.round.question;
      if (!answer || answer.status !== AnswerStatus.ANSWERED || !question ||
          answer.match.status !== QuickBattleStatus.ACTIVE || question.answerType !== 'FREE_TEXT') {
        await this.releaseClaim(claim, 'JUDGE_SOURCE_INVALID');
        return true;
      }
      const localizedRoot = this.asRecord(question.localized);
      const localized = this.asRecord(localizedRoot?.[answer.match.language]);
      const canonicalLocale = answer.match.language === question.canonicalLanguage;
      const prompt = typeof localized?.prompt === 'string' ? localized.prompt
        : canonicalLocale ? question.canonicalPrompt : null;
      const expectedAnswer = typeof localized?.expectedAnswer === 'string' ? localized.expectedAnswer
        : canonicalLocale ? question.answerKey : null;
      const rubric = localized?.gradingRubric ?? (canonicalLocale ? question.gradingRubric : null);
      if (!prompt || !expectedAnswer?.trim() || rubric === null || rubric === undefined) {
        await this.releaseClaim(claim, 'JUDGE_LOCALE_RENDERING_MISSING');
        return true;
      }
      const result = await this.judge.judge({
        canonicalQuestion: prompt,
        language: answer.match.language,
        expectedAnswer,
        gradingRubric: rubric as Prisma.JsonValue,
        participantResponse: answer.responseText ?? '',
      });
      if (result.decision === JudgeDecision.UNCERTAIN) {
        await this.releaseClaim(claim, 'JUDGE_UNCERTAIN');
      } else {
        await this.persistDecision(claim, result);
      }
    } catch (error) {
      const code = error instanceof FreeTextJudgeError ? error.code : 'JUDGE_INTERNAL_ERROR';
      await this.releaseClaim(claim, code);
      this.logger.warn(`Quick Battle AI Judge attempt failed: ${code}`);
    }
    return true;
  }

  private async recoverExhaustedLeases(): Promise<void> {
    const stale = await this.prisma.$queryRaw<Array<{ id: string; matchId: string; roundId: string }>>`
      SELECT "id", "matchId", "roundId"
      FROM "QuickBattleAnswer"
      WHERE "judgeStatus" = 'PROCESSING'
        AND "judgeAttempts" >= ${MAX_ATTEMPTS}
        AND "judgeStartedAt" <= clock_timestamp() - (${STALE_LEASE_SECONDS} * INTERVAL '1 second')
      ORDER BY "judgeStartedAt" ASC
      LIMIT 50
    `;
    for (const item of stale) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "QuickBattleMatch" WHERE "id" = ${item.matchId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "QuickBattleRound" WHERE "id" = ${item.roundId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "QuickBattleAnswer" WHERE "id" = ${item.id}::uuid FOR UPDATE`;
        const current = await tx.quickBattleAnswer.findUnique({
          where: { id: item.id },
          select: { judgeStatus: true, judgeAttempts: true, judgeStartedAt: true },
        });
        if (current?.judgeStatus !== JudgeStatus.PROCESSING || current.judgeAttempts < MAX_ATTEMPTS ||
            !current.judgeStartedAt) return;
        const clock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
        const now = clock[0]?.now;
        if (!(now instanceof Date)) throw new Error('Database clock is unavailable');
        if (current.judgeStartedAt.getTime() > now.getTime() - STALE_LEASE_SECONDS * 1000) return;
        await tx.quickBattleAnswer.update({
          where: { id: item.id },
          data: {
            judgeStatus: JudgeStatus.FAILED,
            judgeStartedAt: null,
            judgeLeaseId: null,
            lastErrorCode: 'JUDGE_LEASE_RETRY_EXHAUSTED',
          },
        });
        await tx.quickBattleRound.updateMany({
          where: { id: item.roundId, completedAt: null, voidedAt: null },
          data: { voidedAt: now, voidReason: 'JUDGE_RETRY_EXHAUSTED' },
        });
        await tx.quickBattleMatch.updateMany({
          where: { id: item.matchId, status: { in: [QuickBattleStatus.READY, QuickBattleStatus.ACTIVE] } },
          data: { status: QuickBattleStatus.VOIDED, voidedAt: now, voidReason: 'JUDGE_RETRY_EXHAUSTED' },
        });
      });
    }
  }

  private async claimNextAnswer(matchId?: string): Promise<JudgeClaim | null> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<JudgeClaim[]>`
        WITH candidate AS (
          SELECT answer."id"
          FROM "QuickBattleAnswer" AS answer
          INNER JOIN "QuickBattleRound" AS round
            ON round."id" = answer."roundId" AND round."matchId" = answer."matchId"
          INNER JOIN "QuickBattleMatch" AS match ON match."id" = answer."matchId"
          INNER JOIN "Question" AS question ON question."id" = round."questionId"
          WHERE answer."status" = 'ANSWERED'
            AND answer."judgeAttempts" < ${MAX_ATTEMPTS}
            AND match."status" = 'ACTIVE'
            AND round."completedAt" IS NULL AND round."voidedAt" IS NULL
            AND question."answerType" = 'FREE_TEXT'
            AND (${matchId ?? null}::uuid IS NULL OR match."id" = ${matchId ?? null}::uuid)
            AND (
              (answer."judgeStatus" = 'PENDING' AND answer."judgeAvailableAt" <= clock_timestamp())
              OR
              (answer."judgeStatus" = 'PROCESSING'
                AND answer."judgeStartedAt" <= clock_timestamp() - (${STALE_LEASE_SECONDS} * INTERVAL '1 second'))
            )
          ORDER BY answer."acceptedAt" ASC
          LIMIT 1
          FOR UPDATE OF answer SKIP LOCKED
        )
        UPDATE "QuickBattleAnswer" AS answer
        SET "judgeStatus" = 'PROCESSING',
            "judgeAttempts" = answer."judgeAttempts" + 1,
            "judgeStartedAt" = clock_timestamp(),
            "judgeLeaseId" = gen_random_uuid()
        FROM candidate
        WHERE answer."id" = candidate."id"
        RETURNING answer."id", answer."matchId", answer."roundId",
          answer."judgeAttempts" AS "attempts", answer."judgeLeaseId" AS "leaseId"
      `;
      return rows[0] ?? null;
    });
  }

  private async persistDecision(
    claim: JudgeClaim,
    result: Awaited<ReturnType<FreeTextAnswerJudge['judge']>>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "QuickBattleMatch" WHERE "id" = ${claim.matchId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "QuickBattleRound" WHERE "id" = ${claim.roundId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "QuickBattleAnswer" WHERE "id" = ${claim.id}::uuid FOR UPDATE`;
      const current = await tx.quickBattleAnswer.findUnique({
        where: { id: claim.id }, select: { judgeStatus: true, judgeLeaseId: true },
      });
      if (current?.judgeStatus !== JudgeStatus.PROCESSING || current.judgeLeaseId !== claim.leaseId) return;
      const [match, round] = await Promise.all([
        tx.quickBattleMatch.findUnique({ where: { id: claim.matchId }, select: { status: true } }),
        tx.quickBattleRound.findUnique({ where: { id: claim.roundId }, select: { completedAt: true, voidedAt: true } }),
      ]);
      if (!match || match.status !== QuickBattleStatus.ACTIVE || !round || round.completedAt || round.voidedAt) {
        await tx.quickBattleAnswer.update({
          where: { id: claim.id },
          data: {
            judgeStatus: JudgeStatus.FAILED, judgeStartedAt: null, judgeLeaseId: null,
            lastErrorCode: 'JUDGE_SOURCE_NO_LONGER_ACTIVE',
          },
        });
        return;
      }
      const clock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      const judgedAt = clock[0]?.now;
      if (!(judgedAt instanceof Date)) throw new Error('Database clock is unavailable');
      await tx.quickBattleAnswer.update({
        where: { id: claim.id },
        data: {
          judgeStatus: JudgeStatus.COMPLETED,
          decision: result.decision,
          confidence: result.confidence,
          judgeReason: `${result.reasonCode}: ${result.rationale}`,
          judgeVersion: `${result.provider}:${result.model}:${result.policyVersion}`,
          judgedAt,
          judgeStartedAt: null,
          judgeLeaseId: null,
          lastErrorCode: null,
        },
      });
    });
  }

  private async releaseClaim(claim: JudgeClaim, errorCode: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "QuickBattleMatch" WHERE "id" = ${claim.matchId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "QuickBattleRound" WHERE "id" = ${claim.roundId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "QuickBattleAnswer" WHERE "id" = ${claim.id}::uuid FOR UPDATE`;
      const current = await tx.quickBattleAnswer.findUnique({
        where: { id: claim.id },
        select: { judgeStatus: true, judgeLeaseId: true, judgeAttempts: true },
      });
      if (current?.judgeStatus !== JudgeStatus.PROCESSING || current.judgeLeaseId !== claim.leaseId) return;
      const [matchState, roundState] = await Promise.all([
        tx.quickBattleMatch.findUnique({ where: { id: claim.matchId }, select: { status: true } }),
        tx.quickBattleRound.findUnique({ where: { id: claim.roundId }, select: { completedAt: true, voidedAt: true } }),
      ]);
      if (!matchState || matchState.status !== QuickBattleStatus.ACTIVE ||
          !roundState || roundState.completedAt || roundState.voidedAt) {
        await tx.quickBattleAnswer.update({
          where: { id: claim.id },
          data: {
            judgeStatus: JudgeStatus.FAILED, judgeStartedAt: null, judgeLeaseId: null,
            lastErrorCode: 'JUDGE_SOURCE_NO_LONGER_ACTIVE',
          },
        });
        return;
      }
      const clock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      const now = clock[0]?.now;
      if (!(now instanceof Date)) throw new Error('Database clock is unavailable');
      if (current.judgeAttempts >= MAX_ATTEMPTS) {
        await tx.quickBattleAnswer.update({
          where: { id: claim.id },
          data: { judgeStatus: JudgeStatus.FAILED, judgeStartedAt: null, judgeLeaseId: null, lastErrorCode: errorCode },
        });
        await tx.quickBattleRound.updateMany({
          where: { id: claim.roundId, completedAt: null, voidedAt: null },
          data: { voidedAt: now, voidReason: 'JUDGE_RETRY_EXHAUSTED' },
        });
        await tx.quickBattleMatch.updateMany({
          where: { id: claim.matchId, status: { in: [QuickBattleStatus.READY, QuickBattleStatus.ACTIVE] } },
          data: { status: QuickBattleStatus.VOIDED, voidedAt: now, voidReason: 'JUDGE_RETRY_EXHAUSTED' },
        });
        return;
      }
      const delaySeconds = Math.min(15, 2 ** Math.max(0, current.judgeAttempts - 1));
      await tx.quickBattleAnswer.update({
        where: { id: claim.id },
        data: {
          judgeStatus: JudgeStatus.PENDING, judgeStartedAt: null, judgeLeaseId: null,
          judgeAvailableAt: new Date(now.getTime() + delaySeconds * 1000),
          lastErrorCode: errorCode,
        },
      });
    });
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (let index = 0; index < MAX_JOBS_PER_POLL; index += 1) {
        if (!(await this.runOnce())) break;
      }
    } catch (error) {
      this.logger.error('Quick Battle AI Judge polling failed',
        error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.polling = false;
    }
  }
}
