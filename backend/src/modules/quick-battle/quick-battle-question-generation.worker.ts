import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  Prisma,
  QuickBattleStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  parseQuestionGenerationInput,
} from '../match/question-generation.context';
import {
  QUESTION_GENERATOR,
  QuestionGenerationError,
  QuestionGenerator,
} from '../match/question-generator.port';
import { GeneratedQuestion } from '../match/question.types';
import {
  GeneratedQuestionValidationError,
  normalizedQuestionFingerprint,
  validateGeneratedQuestion,
} from '../match/question-validation';

const STALE_LEASE_SECONDS = 60;
const POLL_INTERVAL_MS = 1_000;
const MAX_JOBS_PER_POLL = 5;

type QuickBattleGenerationClaim = {
  id: string;
  matchId: string;
  roundId: string;
  attempts: number;
  maxAttempts: number;
  leaseId: string;
  requestContext: Prisma.JsonValue;
};

const SAFE_GENERATION_ERRORS = new Set([
  'GENERATOR_DUPLICATE_QUESTION',
  'GENERATOR_FINGERPRINT_INVALID',
  'GENERATOR_INPUT_INVALID',
  'GENERATOR_INTERNAL_ERROR',
  'GENERATOR_LOCALIZATION_INVALID',
  'GENERATOR_OPTIONS_INVALID',
  'GENERATOR_OUTPUT_INVALID',
  'GENERATOR_PROVIDER_EMPTY_OUTPUT',
  'GENERATOR_PROVIDER_HTTP_ERROR',
  'GENERATOR_PROVIDER_INCOMPLETE',
  'GENERATOR_PROVIDER_INVALID_JSON',
  'GENERATOR_PROVIDER_INVALID_RESPONSE',
  'GENERATOR_PROVIDER_NETWORK_ERROR',
  'GENERATOR_PROVIDER_NOT_CONFIGURED',
  'GENERATOR_PROVIDER_REFUSAL',
  'GENERATOR_PROVIDER_TIMEOUT',
  'GENERATOR_RUBRIC_INVALID',
  'GENERATOR_SETTINGS_MISMATCH',
  'GENERATOR_SIMILAR_QUESTION',
  'QUESTION_ANSWER_KEY_INVALID',
  'QUESTION_FINGERPRINT_INVALID',
  'QUESTION_LOCALIZATION_INVALID',
  'QUESTION_OPTIONS_INVALID',
  'QUESTION_OUTPUT_INVALID',
  'QUESTION_RUBRIC_INVALID',
  'QUESTION_VERSION_INVALID',
]);

function promptTokenSet(prompt: string): Set<string> {
  return new Set(
    (prompt.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []),
  );
}

function hasHighLexicalSimilarity(first: string, second: string): boolean {
  const left = promptTokenSet(first);
  const right = promptTokenSet(second);
  if (left.size < 6 || right.size < 6) return false;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  const minimumCoverage = overlap / Math.min(left.size, right.size);
  const jaccard = overlap / (left.size + right.size - overlap);
  return minimumCoverage >= 0.82 && jaccard >= 0.65;
}

export type ExclusionQuestion = {
  questionId: string | null;
  question: { contentFingerprint: string | null; canonicalPrompt: string } | null;
};

export function mergeQuickBattleQuestionExclusions(
  input: ReturnType<typeof parseQuestionGenerationInput>,
  sameMatchQuestions: ExclusionQuestion[],
  recentServedQuestions: ExclusionQuestion[],
) {
  const questions = [...sameMatchQuestions, ...recentServedQuestions];
  return {
    ...input,
    excludedQuestionIds: [
      ...new Set([
        ...input.excludedQuestionIds,
        ...questions.flatMap((item) => item.questionId ? [item.questionId] : []),
      ]),
    ],
    excludedQuestionFingerprints: [
      ...new Set([
        ...input.excludedQuestionFingerprints,
        ...questions.flatMap((item) =>
          item.question?.contentFingerprint ? [item.question.contentFingerprint] : [],
        ),
      ]),
    ],
    excludedQuestionPrompts: [
      ...new Set([
        ...(input.excludedQuestionPrompts ?? []),
        ...questions.flatMap((item) =>
          item.question?.canonicalPrompt ? [item.question.canonicalPrompt] : [],
        ),
      ]),
    ],
  };
}

function generationErrorCode(error: unknown): string {
  if (
    error instanceof QuestionGenerationError &&
    /^GENERATOR_PROVIDER_HTTP_\d{3}$/.test(error.code)
  ) return 'GENERATOR_PROVIDER_HTTP_ERROR';
  if (
    (error instanceof QuestionGenerationError ||
      error instanceof GeneratedQuestionValidationError) &&
    SAFE_GENERATION_ERRORS.has(error.code)
  ) return error.code;
  return 'GENERATOR_INTERNAL_ERROR';
}

@Injectable()
export class QuickBattleQuestionGenerationWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(QuickBattleQuestionGenerationWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(QUESTION_GENERATOR)
    private readonly generator: QuestionGenerator,
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
      const persistedInput = parseQuestionGenerationInput(claim.requestContext);
      const priorQuestions = await this.prisma.quickBattleRound.findMany({
        where: { matchId: claim.matchId, questionId: { not: null } },
        select: {
          questionId: true,
          question: { select: { contentFingerprint: true, canonicalPrompt: true } },
        },
      });
      const recentServedQuestions = await this.getRecentServedQuestions(claim);
      const input = mergeQuickBattleQuestionExclusions(
        persistedInput,
        priorQuestions,
        recentServedQuestions,
      );
      const generated = validateGeneratedQuestion(await this.generator.generate(input));
      if (generated.category !== input.category || generated.difficulty !== input.difficulty || generated.canonicalLanguage !== input.language || generated.answerType !== input.answerType || generated.timeLimitSeconds !== input.timeLimitSeconds) {
        throw new QuestionGenerationError('GENERATOR_SETTINGS_MISMATCH', 'Generated question does not match its persisted request');
      }
      await this.persistGeneratedQuestion(claim, generated, input);
    } catch (error) {
      const code = generationErrorCode(error);
      await this.releaseClaim(claim, code);
      this.logger.warn(`Quick Battle question generation attempt failed: ${code}`);
    }
    return true;
  }

  private async getRecentServedQuestions(
    claim: QuickBattleGenerationClaim,
  ): Promise<ExclusionQuestion[]> {
    const owner = await this.prisma.quickBattleMatch.findUnique({
      where: { id: claim.matchId },
      select: { userId: true, guestIdentityId: true },
    });
    if (!owner || (!owner.userId && !owner.guestIdentityId)) {
      throw new Error('Quick Battle owner is unavailable for recent-question exclusion');
    }

    return this.prisma.quickBattleRound.findMany({
      where: {
        matchId: { not: claim.matchId },
        startedAt: { not: null },
        questionId: { not: null },
        match: {
          is: owner.userId
            ? { userId: owner.userId }
            : { guestIdentityId: owner.guestIdentityId },
        },
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: {
        questionId: true,
        question: {
          select: {
            contentFingerprint: true,
            canonicalPrompt: true,
          },
        },
      },
    });
  }

  private async claimNextJob(): Promise<QuickBattleGenerationClaim | null> {
    return this.prisma.$transaction(async (tx) => {
      const staleJobs = await tx.$queryRaw<Array<{ id: string; matchId: string }>>`
        SELECT "id", "matchId"
        FROM "QuickBattleQuestionJob"
        WHERE "status" = 'PROCESSING'
          AND "attempts" >= "maxAttempts"
          AND "leaseAt" <= clock_timestamp() - (${STALE_LEASE_SECONDS} * INTERVAL '1 second')
        ORDER BY "leaseAt" ASC
        LIMIT 20
      `;
      for (const job of staleJobs) {
        // All transitions lock the aggregate first, then the job, avoiding
        // lock-order inversions with question persistence and retry handling.
        await tx.$queryRaw`SELECT "id" FROM "QuickBattleMatch" WHERE "id" = ${job.matchId}::uuid FOR UPDATE`;
        const failed = await tx.$executeRaw`
          UPDATE "QuickBattleQuestionJob"
          SET "status" = 'FAILED',
              "leaseId" = NULL,
              "leaseAt" = NULL,
              "completedAt" = clock_timestamp(),
              "lastErrorCode" = 'GENERATOR_LEASE_EXPIRED'
          WHERE "id" = ${job.id}::uuid
            AND "status" = 'PROCESSING'
            AND "attempts" >= "maxAttempts"
            AND "leaseAt" <= clock_timestamp() - (${STALE_LEASE_SECONDS} * INTERVAL '1 second')
        `;
        if (failed > 0) {
          await tx.$executeRaw`
            UPDATE "QuickBattleMatch"
            SET "status" = 'VOIDED',
                "voidedAt" = clock_timestamp(),
                "voidReason" = 'QUESTION_GENERATION_EXHAUSTED'
            WHERE "id" = ${job.matchId}::uuid
              AND "status" IN ('PREPARING', 'READY', 'ACTIVE')
          `;
        }
      }

      const claims = await tx.$queryRaw<QuickBattleGenerationClaim[]>`
        WITH candidate AS (
          SELECT job."id"
          FROM "QuickBattleQuestionJob" AS job
          INNER JOIN "QuickBattleMatch" AS match ON match."id" = job."matchId"
          INNER JOIN "QuickBattleRound" AS round
            ON round."id" = job."roundId" AND round."matchId" = job."matchId"
          WHERE match."status" IN ('PREPARING', 'READY', 'ACTIVE')
            AND (
              (match."status" = 'PREPARING' AND round."roundNumber" <= 3)
              OR match."status" IN ('READY', 'ACTIVE')
            )
            AND job."attempts" < job."maxAttempts"
            AND (
              (job."status" = 'PENDING' AND job."availableAt" <= clock_timestamp())
              OR
              (job."status" = 'PROCESSING'
                AND job."leaseAt" <= clock_timestamp() - (${STALE_LEASE_SECONDS} * INTERVAL '1 second'))
            )
          ORDER BY
            CASE WHEN round."roundNumber" <= 3 THEN 0 ELSE 1 END,
            job."availableAt" ASC,
            job."createdAt" ASC
          LIMIT 1
          FOR UPDATE OF job SKIP LOCKED
        )
        UPDATE "QuickBattleQuestionJob" AS job
        SET "status" = 'PROCESSING',
            "attempts" = job."attempts" + 1,
            "leaseId" = gen_random_uuid(),
            "leaseAt" = clock_timestamp()
        FROM candidate
        WHERE job."id" = candidate."id"
        RETURNING job."id", job."matchId", job."roundId",
          job."attempts", job."maxAttempts", job."leaseId", job."requestContext"
      `;
      return claims[0] ?? null;
    });
  }

  private async persistGeneratedQuestion(
    claim: QuickBattleGenerationClaim,
    generated: GeneratedQuestion,
    input: ReturnType<typeof parseQuestionGenerationInput>,
  ): Promise<void> {
    const fingerprint = normalizedQuestionFingerprint(generated);
    if (generated.contentFingerprint && generated.contentFingerprint !== fingerprint) {
      throw new QuestionGenerationError(
        'GENERATOR_FINGERPRINT_INVALID',
        'Generated question fingerprint does not match its content',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "QuickBattleMatch" WHERE "id" = ${claim.matchId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "QuickBattleQuestionJob" WHERE "id" = ${claim.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "QuickBattleRound" WHERE "id" = ${claim.roundId}::uuid FOR UPDATE`;

      const job = await tx.quickBattleQuestionJob.findUnique({
        where: { id: claim.id },
        select: { status: true, leaseId: true, leaseAt: true, matchId: true, roundId: true },
      });
      if (
        job?.status !== 'PROCESSING' ||
        job.leaseId !== claim.leaseId ||
        job.matchId !== claim.matchId ||
        job.roundId !== claim.roundId
      ) return;

      const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      const now = nowRows[0]?.now;
      if (!(now instanceof Date) || !job.leaseAt ||
        job.leaseAt.getTime() <= now.getTime() - STALE_LEASE_SECONDS * 1000) return;

      const match = await tx.quickBattleMatch.findUnique({
        where: { id: claim.matchId },
        select: { status: true, language: true, generationPolicyVersion: true },
      });
      const round = await tx.quickBattleRound.findUnique({
        where: { id: claim.roundId },
        select: {
          roundNumber: true,
          category: true,
          subcategoryId: true,
          difficulty: true,
          questionId: true,
        },
      });
      if (
        !match ||
        !round ||
        !new Set<QuickBattleStatus>([QuickBattleStatus.PREPARING, QuickBattleStatus.READY, QuickBattleStatus.ACTIVE]).has(match.status) ||
        round.questionId ||
        input.category !== round.category ||
        input.subcategoryId !== round.subcategoryId ||
        input.difficulty.toUpperCase() !== round.difficulty ||
        input.language !== match.language
      ) {
        await tx.quickBattleQuestionJob.update({
          where: { id: claim.id },
          data: { status: 'CANCELLED', leaseId: null, leaseAt: null, completedAt: now, lastErrorCode: 'GENERATOR_SETTINGS_MISMATCH' },
        });
        await tx.$executeRaw`UPDATE "QuickBattleMatch" SET "status" = 'VOIDED', "voidedAt" = clock_timestamp(), "voidReason" = 'GENERATION_CONTEXT_MISMATCH' WHERE "id" = ${claim.matchId}::uuid AND "status" IN ('PREPARING', 'READY', 'ACTIVE')`;
        return;
      }

      const duplicate = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT round."id"
        FROM "QuickBattleRound" AS round
        INNER JOIN "Question" AS question ON question."id" = round."questionId"
        WHERE round."matchId" = ${claim.matchId}::uuid
          AND round."id" <> ${claim.roundId}::uuid
          AND question."contentFingerprint" = ${fingerprint}
        LIMIT 1
      `;
      if (duplicate.length > 0) {
        throw new QuestionGenerationError(
          'GENERATOR_DUPLICATE_QUESTION',
          'Generated question duplicates an earlier question in this match',
        );
      }

      const previousQuestions = await tx.quickBattleRound.findMany({
        where: {
          matchId: claim.matchId,
          id: { not: claim.roundId },
          questionId: { not: null },
        },
        select: { question: { select: { canonicalPrompt: true } } },
      });
      if (previousQuestions.some((item) =>
        item.question?.canonicalPrompt &&
        hasHighLexicalSimilarity(generated.canonicalPrompt, item.question.canonicalPrompt),
      )) {
        throw new QuestionGenerationError(
          'GENERATOR_SIMILAR_QUESTION',
          'Generated question is too similar to an earlier question in this match',
        );
      }

      const question = await tx.question.create({
        data: {
          category: generated.category,
          difficulty: generated.difficulty,
          canonicalLanguage: generated.canonicalLanguage,
          answerType: generated.answerType,
          canonicalPrompt: generated.canonicalPrompt,
          canonicalOptions: generated.canonicalOptions === null
            ? Prisma.DbNull
            : generated.canonicalOptions as unknown as Prisma.InputJsonValue,
          answerKey: generated.answerKey,
          gradingRubric: generated.gradingRubric,
          localized: generated.localized,
          timeLimitSeconds: generated.timeLimitSeconds,
          contentVersion: generated.contentVersion,
          judgeVersion: generated.judgeVersion,
          generatorVersion: generated.generatorVersion,
          modelVersion: generated.modelVersion,
          generationPolicyVersion: generated.generationPolicyVersion,
          contentFingerprint: fingerprint,
        },
        select: { id: true },
      });

      await tx.quickBattleRound.update({
        where: { id: claim.roundId },
        data: { questionId: question.id },
      });
      await tx.quickBattleQuestionJob.update({
        where: { id: claim.id },
        data: {
          status: 'COMPLETED',
          generatedQuestionId: question.id,
          leaseId: null,
          leaseAt: null,
          completedAt: now,
          lastErrorCode: null,
        },
      });

      if (match.status === QuickBattleStatus.PREPARING) {
        const prepared = await tx.quickBattleRound.count({
          where: {
            matchId: claim.matchId,
            roundNumber: { lte: 3 },
            questionId: { not: null },
          },
        });
        if (prepared >= 3) {
          await tx.quickBattleMatch.updateMany({
            where: { id: claim.matchId, status: QuickBattleStatus.PREPARING },
            data: { status: QuickBattleStatus.READY },
          });
        }
      }
    });
  }

  private async releaseClaim(
    claim: QuickBattleGenerationClaim,
    errorCode: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "QuickBattleMatch" WHERE "id" = ${claim.matchId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "QuickBattleQuestionJob" WHERE "id" = ${claim.id}::uuid FOR UPDATE`;
      const current = await tx.quickBattleQuestionJob.findUnique({
        where: { id: claim.id },
        select: { status: true, leaseId: true, attempts: true, maxAttempts: true, matchId: true },
      });
      if (current?.status !== 'PROCESSING' || current.leaseId !== claim.leaseId) return;
      const matchState = await tx.quickBattleMatch.findUnique({
        where: { id: current.matchId },
        select: { status: true },
      });
      if (!matchState || !new Set<QuickBattleStatus>([QuickBattleStatus.PREPARING, QuickBattleStatus.READY, QuickBattleStatus.ACTIVE]).has(matchState.status)) {
        const cancelledClock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
        const cancelledAt = cancelledClock[0]?.now;
        if (!(cancelledAt instanceof Date)) throw new Error('Database clock did not return a valid cancellation timestamp');
        await tx.quickBattleQuestionJob.update({
          where: { id: claim.id },
          data: { status: 'CANCELLED', leaseId: null, leaseAt: null, completedAt: cancelledAt, lastErrorCode: 'MATCH_NOT_ACTIVE' },
        });
        return;
      }

      if (current.attempts >= current.maxAttempts) {
        const clock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
        const failedAt = clock[0]?.now;
        if (!(failedAt instanceof Date)) throw new Error('Database clock did not return a valid failure timestamp');
        await tx.quickBattleQuestionJob.update({
          where: { id: claim.id },
          data: {
            status: 'FAILED',
            leaseId: null,
            leaseAt: null,
            completedAt: failedAt,
            lastErrorCode: errorCode,
          },
        });
        await tx.quickBattleMatch.updateMany({
          where: {
            id: current.matchId,
            status: { in: [QuickBattleStatus.PREPARING, QuickBattleStatus.READY, QuickBattleStatus.ACTIVE] },
          },
          data: {
            status: QuickBattleStatus.VOIDED,
            voidedAt: failedAt,
            voidReason: 'QUESTION_GENERATION_EXHAUSTED',
          },
        });
        return;
      }

      const delaySeconds = Math.min(30, 2 ** Math.max(0, current.attempts - 1));
      const retryClock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      const retryAt = retryClock[0]?.now;
      if (!(retryAt instanceof Date)) throw new Error('Database clock did not return a valid retry timestamp');
      await tx.quickBattleQuestionJob.update({
        where: { id: claim.id },
        data: {
          status: 'PENDING',
          leaseId: null,
          leaseAt: null,
          availableAt: new Date(retryAt.getTime() + delaySeconds * 1000),
          lastErrorCode: errorCode,
        },
      });
    });
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
        'Quick Battle question generation polling failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      this.polling = false;
    }
  }
}
