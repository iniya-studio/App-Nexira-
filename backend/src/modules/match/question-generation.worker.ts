import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  MatchMode,
  MatchStatus,
  ParticipantStatus,
  ParticipantType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  parseQuestionGenerationInput,
  questionGenerationInputForMatch,
} from './question-generation.context';
import {
  QUESTION_GENERATOR,
  QuestionGenerationError,
  QuestionGenerator,
} from './question-generator.port';
import { GeneratedQuestion } from './question.types';
import {
  GeneratedQuestionValidationError,
  normalizedQuestionFingerprint,
  validateGeneratedQuestion,
} from './question-validation';

const STALE_LEASE_SECONDS = 60;
const READINESS_TIMEOUT_SECONDS = 120;
const POLL_INTERVAL_MS = 1_000;
const MAX_JOBS_PER_POLL = 5;

type GenerationClaim = {
  id: string;
  matchId: string;
  sourceRoundId: string | null;
  triggerReason: string;
  attempts: number;
  maxAttempts: number;
  leaseId: string;
  requestContext: Prisma.JsonValue;
};

@Injectable()
export class QuestionGenerationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QuestionGenerationWorker.name);
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
      const input = parseQuestionGenerationInput(claim.requestContext);
      const generated = validateGeneratedQuestion(
        await this.generator.generate(input),
      );
      this.validateAgainstRequest(generated, input);
      await this.persistGeneratedQuestion(claim, generated, input);
    } catch (error) {
      const code =
        error instanceof QuestionGenerationError ||
        error instanceof GeneratedQuestionValidationError
          ? error.code
          : 'GENERATOR_INTERNAL_ERROR';
      await this.releaseClaim(claim, code);
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
        'Question generation worker polling failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      this.polling = false;
    }
  }

  private async claimNextJob(): Promise<GenerationClaim | null> {
    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.$executeRaw`
        UPDATE "QuestionGenerationJob" AS job
        SET
          "status" = 'CANCELLED',
          "leaseId" = NULL,
          "leaseAt" = NULL,
          "completedAt" = clock_timestamp(),
          "lastErrorCode" = 'MATCH_NOT_ACTIVE'
        FROM "Match" AS match
        WHERE job."matchId" = match."id"
          AND (
            (job."triggerReason" = 'INITIAL_MATCH' AND match."status" <> 'WAITING')
            OR
            (job."triggerReason" <> 'INITIAL_MATCH' AND match."status" <> 'READY')
          )
          AND job."status" IN ('PENDING', 'PROCESSING')
      `;
      if (cancelled > 0) {
        this.logger.warn(
          `Cancelled ${cancelled} question generation job(s) for inactive matches`,
        );
      }

      const expiredReadiness = await tx.$queryRaw<
        Array<{ matchId: string; roundId: string }>
      >`
        UPDATE "Match" AS match
        SET "status" = 'CANCELLED', "completedAt" = clock_timestamp()
        WHERE match."status" = 'READY'
          AND EXISTS (
            SELECT 1
            FROM "Round" AS round
            WHERE round."matchId" = match."id"
              AND round."roundNumber" = match."currentRound" + 1
              AND round."startedAt" IS NULL
              AND round."readinessExpiresAt" <= clock_timestamp()
              AND EXISTS (
                SELECT 1
                FROM "RoundReadiness" AS readiness
                WHERE readiness."roundId" = round."id"
                  AND readiness."isReady" = false
              )
          )
        RETURNING match."id" AS "matchId",
          (SELECT round."id" FROM "Round" AS round
            WHERE round."matchId" = match."id"
              AND round."roundNumber" = match."currentRound" + 1
            LIMIT 1) AS "roundId"
      `;
      for (const expired of expiredReadiness) {
        await tx.$executeRaw`
          UPDATE "QuestionGenerationJob" AS job
          SET "lastErrorCode" = 'READINESS_TIMEOUT'
          WHERE job."matchId" = ${expired.matchId}::uuid
            AND job."generatedQuestionId" = (
              SELECT "questionId" FROM "Round"
              WHERE "id" = ${expired.roundId}::uuid
            )
        `;
        this.logger.error(
          `Replacement round ${expired.roundId} readiness timed out; match ${expired.matchId} cancelled without score changes`,
        );
      }

      const exhausted = await tx.$queryRaw<
        Array<{ id: string; matchId: string; triggerReason: string }>
      >`
        WITH expired AS (
          SELECT job."id"
          FROM "QuestionGenerationJob" AS job
          WHERE job."status" = 'PROCESSING'
            AND job."attempts" >= job."maxAttempts"
            AND job."leaseAt" <= clock_timestamp() - (${STALE_LEASE_SECONDS} * INTERVAL '1 second')
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "QuestionGenerationJob" AS job
        SET
          "status" = 'FAILED',
          "leaseId" = NULL,
          "leaseAt" = NULL,
          "completedAt" = clock_timestamp(),
          "lastErrorCode" = 'GENERATOR_LEASE_EXPIRED'
        FROM expired
        WHERE job."id" = expired."id"
        RETURNING job."id", job."matchId", job."triggerReason"
      `;
      for (const job of exhausted) {
        await tx.$executeRaw`
          UPDATE "Match"
          SET "status" = 'CANCELLED', "completedAt" = clock_timestamp()
          WHERE "id" = ${job.matchId}::uuid
            AND "status" = CASE WHEN ${job.triggerReason} = 'INITIAL_MATCH'
              THEN 'WAITING'::"MatchStatus" ELSE 'READY'::"MatchStatus" END
        `;
        this.logger.error(
          `Question generation job ${job.id} exhausted its lease after the final attempt; match ${job.matchId} cancelled`,
        );
      }

      const claims = await tx.$queryRaw<GenerationClaim[]>`
        WITH candidate AS (
          SELECT job."id"
          FROM "QuestionGenerationJob" AS job
          INNER JOIN "Match" AS match ON match."id" = job."matchId"
          WHERE (
              (job."triggerReason" = 'INITIAL_MATCH' AND match."status" = 'WAITING')
              OR
              (job."triggerReason" <> 'INITIAL_MATCH' AND match."status" = 'READY')
            )
            AND job."attempts" < job."maxAttempts"
            AND (
              (job."status" = 'PENDING' AND job."availableAt" <= clock_timestamp())
              OR
              (job."status" = 'PROCESSING'
                AND job."leaseAt" <= clock_timestamp() - (${STALE_LEASE_SECONDS} * INTERVAL '1 second'))
            )
          ORDER BY job."availableAt" ASC, job."createdAt" ASC
          LIMIT 1
          FOR UPDATE OF job SKIP LOCKED
        )
        UPDATE "QuestionGenerationJob" AS job
        SET
          "status" = 'PROCESSING',
          "attempts" = job."attempts" + 1,
          "leaseId" = gen_random_uuid(),
          "leaseAt" = clock_timestamp()
        FROM candidate
        WHERE job."id" = candidate."id"
        RETURNING
          job."id",
          job."matchId",
          job."sourceRoundId",
          job."triggerReason",
          job."attempts",
          job."maxAttempts",
          job."leaseId",
          job."requestContext"
      `;
      return claims[0] ?? null;
    });
  }

  private async persistGeneratedQuestion(
    claim: GenerationClaim,
    generated: GeneratedQuestion,
    input: ReturnType<typeof parseQuestionGenerationInput>,
  ): Promise<void> {
    const fingerprint = normalizedQuestionFingerprint(generated);
    if (
      generated.contentFingerprint &&
      generated.contentFingerprint !== fingerprint
    ) {
      throw new QuestionGenerationError(
        'GENERATOR_FINGERPRINT_INVALID',
        'Generated question fingerprint does not match its content',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Match" WHERE "id" = ${claim.matchId}::uuid FOR UPDATE
      `;
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "QuestionGenerationJob"
        WHERE "id" = ${claim.id}::uuid
        FOR UPDATE
      `;

      const current = await tx.questionGenerationJob.findUnique({
        where: { id: claim.id },
        select: {
          status: true,
          leaseId: true,
          leaseAt: true,
          matchId: true,
          sourceRoundId: true,
        },
      });
      if (
        current?.status !== 'PROCESSING' ||
        current.leaseId !== claim.leaseId ||
        current.matchId !== claim.matchId ||
        current.sourceRoundId !== claim.sourceRoundId
      ) {
        return;
      }
      const leaseClock = await tx.$queryRaw<Array<{ now: Date }>>`
        SELECT clock_timestamp() AS "now"
      `;
      if (
        !current.leaseAt ||
        !(leaseClock[0]?.now instanceof Date) ||
        current.leaseAt.getTime() <=
          leaseClock[0].now.getTime() - STALE_LEASE_SECONDS * 1000
      ) {
        return;
      }

      const match = await tx.match.findUnique({
        where: { id: claim.matchId },
        select: {
          id: true,
          mode: true,
          status: true,
          currentRound: true,
          roundsTarget: true,
          participants: {
            select: { id: true, status: true, participantType: true },
          },
        },
      });
      const isInitialGeneration = claim.triggerReason === 'INITIAL_MATCH';
      const sourceRound = claim.sourceRoundId
        ? await tx.round.findUnique({
            where: { id: claim.sourceRoundId },
            select: {
              matchId: true,
              roundNumber: true,
              voidedAt: true,
              completedAt: true,
            },
          })
        : null;
      const validInitialState = Boolean(
        isInitialGeneration && claim.sourceRoundId === null && match &&
        match.status === MatchStatus.WAITING && match.currentRound === 0,
      );
      const validNextRoundState = Boolean(
        claim.triggerReason === 'NEXT_ROUND' && claim.sourceRoundId !== null &&
        match && match.status === MatchStatus.READY && sourceRound &&
        sourceRound.matchId === match.id && sourceRound.completedAt &&
        !sourceRound.voidedAt && match.currentRound === sourceRound.roundNumber &&
        sourceRound.roundNumber < match.roundsTarget,
      );
      const validRecoveryState = Boolean(
        claim.triggerReason !== 'INITIAL_MATCH' &&
        claim.triggerReason !== 'NEXT_ROUND' &&
        claim.sourceRoundId !== null && match &&
        match.status === MatchStatus.READY && sourceRound &&
        sourceRound.matchId === match.id && sourceRound.voidedAt &&
        sourceRound.completedAt && match.currentRound === sourceRound.roundNumber,
      );

      if (!match || (!validInitialState && !validRecoveryState && !validNextRoundState)) {
        await tx.$executeRaw`
          UPDATE "QuestionGenerationJob"
          SET
            "status" = 'CANCELLED',
            "leaseId" = NULL,
            "leaseAt" = NULL,
            "lastErrorCode" = 'RECOVERY_SOURCE_NOT_ACTIVE',
            "completedAt" = clock_timestamp()
          WHERE "id" = ${claim.id}::uuid
            AND "status" = 'PROCESSING'
            AND "leaseId" = ${claim.leaseId}::uuid
        `;
        await tx.$executeRaw`
          UPDATE "Match"
          SET "status" = 'CANCELLED', "completedAt" = clock_timestamp()
          WHERE "id" = ${claim.matchId}::uuid
            AND "status" = CASE WHEN ${isInitialGeneration}
              THEN 'WAITING'::"MatchStatus" ELSE 'READY'::"MatchStatus" END
        `;
        return;
      }

      const requiredParticipants = match.participants.filter(
        (participant) =>
          participant.status === ParticipantStatus.ACTIVE ||
          participant.status === ParticipantStatus.DISCONNECTED,
      );
      const activeHumans = requiredParticipants.filter(
        (participant) => participant.participantType === ParticipantType.HUMAN,
      ).length;
      const activeAi = requiredParticipants.filter(
        (participant) => participant.participantType === ParticipantType.AI,
      ).length;
      if (
        match.participants.length !== 2 ||
        requiredParticipants.length !== 2 ||
        (match.mode === MatchMode.ONE_V_ONE &&
          (activeHumans !== 2 || activeAi !== 0)) ||
        (match.mode === MatchMode.ONE_V_AI &&
          (activeHumans !== 1 || activeAi !== 1)) ||
        match.mode === MatchMode.ROOM
      ) {
        throw new QuestionGenerationError(
          'GENERATOR_MATCH_PARTICIPANTS_INVALID',
          'Match participants are not eligible for replacement readiness',
        );
      }

      const currentExclusions = await questionGenerationInputForMatch(
        tx,
        match.id,
        {
          category: input.category,
          difficulty: input.difficulty,
          language: input.language,
          answerType: input.answerType,
          timeLimitSeconds: input.timeLimitSeconds,
        },
      );
      if (
        currentExclusions.excludedQuestionFingerprints.includes(fingerprint) ||
        input.excludedQuestionFingerprints.includes(fingerprint)
      ) {
        throw new QuestionGenerationError(
          'GENERATOR_DUPLICATE_QUESTION',
          'Generated question repeats a question used in this match or its rematch',
        );
      }

      const question = await tx.question.create({
        data: {
          category: generated.category,
          difficulty: generated.difficulty,
          canonicalLanguage: generated.canonicalLanguage,
          answerType: generated.answerType,
          canonicalPrompt: generated.canonicalPrompt,
          canonicalOptions:
            generated.canonicalOptions === null
              ? Prisma.DbNull
              : (generated.canonicalOptions as unknown as Prisma.InputJsonValue),
          answerKey: generated.answerKey,
          gradingRubric: generated.gradingRubric,
          localized: generated.localized,
          timeLimitSeconds: generated.timeLimitSeconds,
          contentVersion: generated.contentVersion,
          generatorVersion: generated.generatorVersion,
          modelVersion: generated.modelVersion,
          generationPolicyVersion: generated.generationPolicyVersion,
          contentFingerprint: fingerprint,
        },
      });
      const round = await tx.round.create({
        data: {
          matchId: match.id,
          roundNumber: isInitialGeneration ? 1 : sourceRound!.roundNumber + 1,
          questionId: question.id,
          startedAt: null,
          deadlineAt: null,
        },
      });
      const dbTime = await tx.$queryRaw<Array<{ now: Date }>>`
        SELECT clock_timestamp() AS "now"
      `;
      const readyAt = dbTime[0]?.now;
      if (!(readyAt instanceof Date) || Number.isNaN(readyAt.getTime())) {
        throw new Error(
          'Database clock did not return a valid readiness timestamp',
        );
      }
      await tx.roundReadiness.createMany({
        data: requiredParticipants.map((participant) => {
          const isReady = participant.participantType === ParticipantType.AI;
          return {
            matchId: match.id,
            roundId: round.id,
            participantId: participant.id,
            isReady,
            readyAt: isReady ? readyAt : null,
          };
        }),
      });
      if (match.mode === MatchMode.ONE_V_AI) {
        const aiParticipant = requiredParticipants.find(
          (participant) => participant.participantType === ParticipantType.AI,
        );
        if (!aiParticipant || activeAi !== 1) {
          throw new QuestionGenerationError(
            'GENERATOR_AI_PARTICIPANT_INVALID',
            'A 1vAI match must contain exactly one active AI participant',
          );
        }
        await tx.aiAnswerJob.create({
          data: {
            matchId: match.id,
            roundId: round.id,
            participantId: aiParticipant.id,
            idempotencyKey: `ai-answer:${round.id}:${aiParticipant.id}:v1`,
          },
        });
      }
      const readinessExpiry = new Date(
        readyAt.getTime() + READINESS_TIMEOUT_SECONDS * 1000,
      );
      await tx.round.update({
        where: { id: round.id },
        data: { readinessExpiresAt: readinessExpiry },
      });
      if (isInitialGeneration) {
        const readyMatch = await tx.match.updateMany({
          where: { id: match.id, status: MatchStatus.WAITING, currentRound: 0 },
          data: { status: MatchStatus.READY },
        });
        if (readyMatch.count !== 1) {
          throw new QuestionGenerationError(
            'GENERATOR_MATCH_STATE_CHANGED',
            'Initial match changed state before its question was prepared',
          );
        }
      }

      const completed = await tx.$executeRaw`
        UPDATE "QuestionGenerationJob"
        SET
          "status" = 'COMPLETED',
          "generatedQuestionId" = ${question.id}::uuid,
          "leaseId" = NULL,
          "leaseAt" = NULL,
          "completedAt" = clock_timestamp(),
          "lastErrorCode" = NULL
        WHERE "id" = ${claim.id}::uuid
          AND "status" = 'PROCESSING'
          AND "leaseId" = ${claim.leaseId}::uuid
          AND "leaseAt" > clock_timestamp() - (${STALE_LEASE_SECONDS} * INTERVAL '1 second')
      `;
      if (completed !== 1) {
        throw new QuestionGenerationError(
          'GENERATOR_LEASE_EXPIRED',
          'Question generation lease expired before persistence completed',
        );
      }
    });
  }

  private validateAgainstRequest(
    generated: GeneratedQuestion,
    input: ReturnType<typeof parseQuestionGenerationInput>,
  ): void {
    if (
      !generated.generatorVersion?.trim() ||
      !generated.modelVersion?.trim() ||
      !generated.generationPolicyVersion?.trim()
    ) {
      throw new QuestionGenerationError(
        'GENERATOR_VERSION_INVALID',
        'Generated question is missing generator version metadata',
      );
    }

    if (
      generated.category !== input.category ||
      generated.difficulty !== input.difficulty ||
      generated.canonicalLanguage !== input.language ||
      generated.answerType !== input.answerType ||
      generated.timeLimitSeconds !== input.timeLimitSeconds
    ) {
      throw new QuestionGenerationError(
        'GENERATOR_SETTINGS_MISMATCH',
        'Generated question does not match its persisted request',
      );
    }

    const fingerprint = normalizedQuestionFingerprint(generated);
    if (input.excludedQuestionFingerprints.includes(fingerprint)) {
      throw new QuestionGenerationError(
        'GENERATOR_DUPLICATE_QUESTION',
        'Generated question repeats excluded content',
      );
    }
  }

  private async releaseClaim(
    claim: GenerationClaim,
    errorCode: string,
  ): Promise<void> {
    const released = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ status: 'PENDING' | 'FAILED'; matchId: string }>
      >`
        UPDATE "QuestionGenerationJob"
        SET
          "status" = CASE
            WHEN "attempts" >= "maxAttempts" THEN 'FAILED'::"QuestionGenerationJobStatus"
            ELSE 'PENDING'::"QuestionGenerationJobStatus"
          END,
          "availableAt" = CASE
            WHEN "attempts" >= "maxAttempts" THEN "availableAt"
            ELSE clock_timestamp() + (${this.retryDelayMs(claim.attempts)} * INTERVAL '1 millisecond')
          END,
          "leaseId" = NULL,
          "leaseAt" = NULL,
          "lastErrorCode" = ${errorCode},
          "completedAt" = CASE
            WHEN "attempts" >= "maxAttempts" THEN clock_timestamp()
            ELSE NULL
          END
        WHERE "id" = ${claim.id}::uuid
          AND "status" = 'PROCESSING'
          AND "leaseId" = ${claim.leaseId}::uuid
          AND "leaseAt" > clock_timestamp() - (${STALE_LEASE_SECONDS} * INTERVAL '1 second')
        RETURNING "status", "matchId"
      `;
      const result = rows[0];
      if (result?.status === 'FAILED') {
        await tx.$executeRaw`
          UPDATE "Match"
          SET "status" = 'CANCELLED', "completedAt" = clock_timestamp()
          WHERE "id" = ${result.matchId}::uuid
            AND "status" = CASE WHEN ${claim.triggerReason === 'INITIAL_MATCH'}
              THEN 'WAITING'::"MatchStatus" ELSE 'READY'::"MatchStatus" END
        `;
      }
      return result;
    });

    if (!released) return;
    if (released.status === 'FAILED') {
      this.logger.error(
        `Question generation job ${claim.id} failed after ${claim.attempts} attempts (${errorCode}); match ${released.matchId} cancelled without score changes`,
      );
    } else {
      this.logger.warn(
        `Question generation job ${claim.id} attempt ${claim.attempts} failed (${errorCode}); retry scheduled`,
      );
    }
  }

  private retryDelayMs(attempt: number): number {
    return Math.min(1_000 * 2 ** Math.max(0, attempt - 1), 8_000);
  }
}
