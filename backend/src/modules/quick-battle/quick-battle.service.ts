import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { AnswerStatus, JudgeStatus, Prisma, QuickBattleStatus, PrincipalType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isTargetLocale, normalizeLocaleCode } from '../../common/localization/locale-registry';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { CATEGORY_SUBCATEGORIES } from '../match/category-catalog';

const QUICK_BATTLE_ROUNDS = 10;
const ACTIVE_STATUSES = [
  QuickBattleStatus.PREPARING,
  QuickBattleStatus.READY,
  QuickBattleStatus.ACTIVE,
] as const;
const GENERATION_POLICY_VERSION = 'quick-battle-generation-v1';
const SCORING_POLICY_VERSION = 'quick-battle-score-v1';
const DIFFICULTY_PLAN = [
  'EASY', 'EASY', 'EASY',
  'MEDIUM', 'MEDIUM', 'MEDIUM', 'MEDIUM',
  'HARD', 'HARD', 'HARD',
] as const;

@Injectable()
export class QuickBattleService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrRecover(
    principal: AuthenticatedPrincipal,
    requestedLanguage?: string,
  ) {
    const owner = this.ownerWhere(principal);
    const principalLock = `nexira:quick-battle:principal:${principal.principalType}:${principal.principalId}`;

    return this.prisma.$transaction(async (tx) => {
      // Serialize concurrent start requests for this principal. The partial
      // unique indexes in PostgreSQL remain the final integrity boundary.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${principalLock})) IS NULL AS locked`;

      const existing = await tx.quickBattleMatch.findFirst({
        where: { ...owner, status: { in: [...ACTIVE_STATUSES] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (existing) return this.getOwnedMatch(tx, existing.id, principal);

      const profileLanguage = principal.principalType === PrincipalType.USER
        ? (await tx.user.findUnique({
            where: { id: principal.principalId },
            select: { preferredLanguage: true },
          }))?.preferredLanguage
        : null;
      const language = normalizeLocaleCode(
        profileLanguage?.trim() || requestedLanguage?.trim() || 'en',
      );
      if (!isTargetLocale(language)) {
        throw new BadRequestException('Unsupported Quick Battle language');
      }

      const categories = Object.keys(CATEGORY_SUBCATEGORIES);
      if (categories.length !== 23) {
        throw new Error('Quick Battle category catalog must contain exactly 23 categories');
      }
      const categoryPlan = this.shuffle(categories).slice(0, QUICK_BATTLE_ROUNDS);
      const subcategoryPlan = categoryPlan.map((category) => {
        const subcategories = CATEGORY_SUBCATEGORIES[category];
        return subcategories[randomInt(subcategories.length)];
      });
      const difficultyPlan = this.shuffle([...DIFFICULTY_PLAN]);

      const match = await tx.quickBattleMatch.create({
        data: {
          ...(principal.principalType === PrincipalType.USER
            ? { userId: principal.principalId }
            : { guestIdentityId: principal.principalId }),
          status: QuickBattleStatus.PREPARING,
          language,
          roundsTarget: QUICK_BATTLE_ROUNDS,
          generationPolicyVersion: GENERATION_POLICY_VERSION,
          scoringPolicyVersion: SCORING_POLICY_VERSION,
        },
        select: { id: true },
      });

      for (let index = 0; index < QUICK_BATTLE_ROUNDS; index += 1) {
        const roundNumber = index + 1;
        const category = categoryPlan[index];
        const difficulty = difficultyPlan[index];
        const subcategoryId = subcategoryPlan[index];
        const round = await tx.quickBattleRound.create({
          data: {
            matchId: match.id,
            roundNumber,
            category,
            subcategoryId,
            difficulty,
          },
          select: { id: true },
        });
        await tx.quickBattleQuestionJob.create({
          data: {
            matchId: match.id,
            roundId: round.id,
            requestContext: {
              category,
              subcategoryId,
              difficulty: difficulty.toLowerCase(),
              language,
              requiredLocales: [language],
              answerType: 'FREE_TEXT',
              timeLimitSeconds: 30,
              excludedQuestionIds: [],
              excludedQuestionFingerprints: [],
              policyVersion: GENERATION_POLICY_VERSION,
            } as Prisma.InputJsonValue,
            maxAttempts: 3,
            idempotencyKey: `quick-battle:${match.id}:round:${roundNumber}:question:v1`,
          },
        });
      }

      return this.getOwnedMatch(tx, match.id, principal);
    });
  }

  async getActive(principal: AuthenticatedPrincipal) {
    const match = await this.prisma.quickBattleMatch.findFirst({
      where: { ...this.ownerWhere(principal), status: { in: [...ACTIVE_STATUSES] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return match ? this.getOwnedMatch(this.prisma, match.id, principal) : null;
  }

  async getMatch(matchId: string, principal: AuthenticatedPrincipal) {
    return this.getOwnedMatch(this.prisma, matchId, principal);
  }


  async getCurrentRound(matchId: string, principal: AuthenticatedPrincipal) {
    const match = await this.prisma.quickBattleMatch.findFirst({
      where: { id: matchId, ...this.ownerWhere(principal) },
      select: {
        id: true, status: true, language: true, currentRound: true, roundsTarget: true,
        rounds: {
          orderBy: { roundNumber: 'asc' },
          select: {
            id: true, roundNumber: true, startedAt: true, deadlineAt: true,
            completedAt: true, voidedAt: true,
            question: {
              select: {
                canonicalLanguage: true, canonicalPrompt: true, localized: true,
                answerType: true, canonicalOptions: true, timeLimitSeconds: true,
              },
            },
            answer: {
              select: {
                id: true, status: true, judgeStatus: true, decision: true,
                acceptedAt: true, elapsedMs: true, judgedAt: true,
              },
            },
          },
        },
      },
    });
    if (!match) throw new NotFoundException('Quick Battle not found');
    const clock = await this.prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
    const serverNow = clock[0]?.now;
    if (!(serverNow instanceof Date) || Number.isNaN(serverNow.getTime())) {
      throw new Error('Database clock did not return a valid timestamp');
    }
    const round = match.rounds.find((item) => item.roundNumber === match.currentRound);
    if (!round || !round.startedAt || !round.deadlineAt || !round.question) {
      return {
        matchId: match.id, matchStatus: match.status, currentRound: match.currentRound,
        roundsTarget: match.roundsTarget,
        serverNow,
        state: match.status === QuickBattleStatus.VOIDED ? 'VOIDED'
          : match.status === QuickBattleStatus.COMPLETED ? 'COMPLETED'
          : match.status === QuickBattleStatus.CANCELLED ? 'CANCELLED'
          : 'WAITING_FOR_PUBLICATION',
        round: null,
      };
    }
    const localizedRoot = this.asRecord(round.question.localized);
    const localized = this.asRecord(localizedRoot?.[match.language]);
    const prompt = typeof localized?.prompt === 'string' ? localized.prompt
      : round.question.canonicalLanguage === match.language ? round.question.canonicalPrompt : null;
    if (!prompt) throw new ConflictException('The published question has no matching locale');
    return {
      matchId: match.id, matchStatus: match.status, currentRound: match.currentRound,
      roundsTarget: match.roundsTarget,
      serverNow,
      state: match.status === QuickBattleStatus.VOIDED ? 'VOIDED'
        : match.status === QuickBattleStatus.COMPLETED ? 'COMPLETED'
          : match.status === QuickBattleStatus.CANCELLED ? 'CANCELLED'
            : round.voidedAt ? 'VOIDED' : round.completedAt ? 'COMPLETED' : 'ACTIVE',
      round: {
        id: round.id, roundNumber: round.roundNumber, startedAt: round.startedAt,
        deadlineAt: round.deadlineAt, completedAt: round.completedAt,
        question: {
          prompt, answerType: round.question.answerType,
          options: round.question.canonicalOptions,
          timeLimitSeconds: round.question.timeLimitSeconds,
        },
        answer: round.answer,
      },
    };
  }

  async submitAnswer(
    matchId: string, roundNumber: number, principal: AuthenticatedPrincipal,
    responseText: string, idempotencyKey: string,
  ) {
    const response = typeof responseText === 'string' ? responseText.trim() : '';
    const key = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
    if (!response || response.length > 2000) {
      throw new BadRequestException('Answer response must contain 1 to 2000 characters');
    }
    if (key.length < 8 || key.length > 128) {
      throw new BadRequestException('Idempotency key must contain 8 to 128 characters');
    }
    if (!Number.isSafeInteger(roundNumber) || roundNumber < 1 || roundNumber > QUICK_BATTLE_ROUNDS) {
      throw new BadRequestException('Round number is invalid');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "QuickBattleMatch" WHERE "id" = ${matchId}::uuid FOR UPDATE`;
      const match = await tx.quickBattleMatch.findFirst({
        where: { id: matchId, ...this.ownerWhere(principal) },
        select: { id: true, status: true, currentRound: true },
      });
      if (!match) throw new NotFoundException('Quick Battle not found');
      const round = await tx.quickBattleRound.findUnique({
        where: { matchId_roundNumber: { matchId, roundNumber } },
        select: {
          id: true, startedAt: true, deadlineAt: true, completedAt: true, voidedAt: true,
          question: { select: { answerType: true } },
        },
      });
      if (!round || !round.question) throw new NotFoundException('Quick Battle round not found');
      const existingByKey = await tx.quickBattleAnswer.findUnique({
        where: { idempotencyKey: key },
        select: { id: true, matchId: true, roundId: true, responseText: true, acceptedAt: true, elapsedMs: true },
      });
      if (existingByKey) {
        if (existingByKey.matchId === matchId && existingByKey.roundId === round.id &&
            existingByKey.responseText === response) {
          return {
            answerId: existingByKey.id, matchId, roundId: round.id,
            acceptedAt: existingByKey.acceptedAt, elapsedMs: existingByKey.elapsedMs,
            status: 'ACCEPTED' as const, replayed: true,
          };
        }
        throw new ConflictException('Idempotency key was already used for another request');
      }
      await tx.$queryRaw`SELECT "id" FROM "QuickBattleRound" WHERE "id" = ${round.id}::uuid FOR UPDATE`;
      if (match.status !== QuickBattleStatus.ACTIVE || match.currentRound !== roundNumber ||
          round.completedAt || round.voidedAt || !round.startedAt || !round.deadlineAt) {
        throw new ConflictException('Quick Battle round is not accepting answers');
      }
      if (round.question.answerType !== 'FREE_TEXT') {
        throw new ConflictException('This Quick Battle answer type is not supported');
      }
      const existingForRound = await tx.quickBattleAnswer.findUnique({
        where: { roundId: round.id }, select: { id: true },
      });
      if (existingForRound) {
        throw new ConflictException('An answer has already been submitted for this round');
      }
      const clock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      const acceptedAt = clock[0]?.now;
      if (!(acceptedAt instanceof Date) || Number.isNaN(acceptedAt.getTime())) {
        throw new Error('Database clock did not return a valid timestamp');
      }
      if (acceptedAt.getTime() >= round.deadlineAt.getTime()) {
        throw new ConflictException('The answer deadline has passed');
      }
      const elapsedMs = acceptedAt.getTime() - round.startedAt.getTime();
      if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0) {
        throw new Error('Database clock returned an invalid answer elapsed time');
      }
      const answer = await tx.quickBattleAnswer.create({
        data: {
          matchId, roundId: round.id, responseText: response,
          status: AnswerStatus.ANSWERED, judgeStatus: JudgeStatus.PENDING,
          elapsedMs, idempotencyKey: key, acceptedAt,
        },
        select: { id: true, acceptedAt: true, elapsedMs: true },
      });
      return {
        answerId: answer.id, matchId, roundId: round.id,
        acceptedAt: answer.acceptedAt, elapsedMs: answer.elapsedMs,
        status: 'ACCEPTED' as const, replayed: false,
      };
    });
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private async getOwnedMatch(
    db: Pick<Prisma.TransactionClient, 'quickBattleMatch'> | PrismaService,
    matchId: string,
    principal: AuthenticatedPrincipal,
  ) {
    const match = await db.quickBattleMatch.findFirst({
      where: { id: matchId, ...this.ownerWhere(principal) },
      select: {
        id: true,
        status: true,
        language: true,
        roundsTarget: true,
        currentRound: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        rounds: {
          orderBy: { roundNumber: 'asc' },
          select: {
            roundNumber: true,
            questionId: true,
            startedAt: true,
            deadlineAt: true,
            completedAt: true,
            voidedAt: true,
          },
        },
      },
    });
    if (!match) throw new NotFoundException('Quick Battle not found');
    return {
      id: match.id,
      status: match.status,
      language: match.language,
      roundsTarget: match.roundsTarget,
      currentRound: match.currentRound,
      startedAt: match.startedAt,
      completedAt: match.completedAt,
      createdAt: match.createdAt,
      rounds: match.rounds.map(({ questionId, ...round }) => ({
        ...round,
        questionReady: questionId !== null,
      })),
    };
  }

  private ownerWhere(principal: AuthenticatedPrincipal) {
    return principal.principalType === PrincipalType.USER
      ? { userId: principal.principalId }
      : { guestIdentityId: principal.principalId };
  }

  private shuffle<T>(values: T[]): T[] {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = randomInt(index + 1);
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }
}
