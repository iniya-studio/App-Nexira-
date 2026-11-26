import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { Prisma, QuickBattleStatus, PrincipalType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isEnabledLocale, normalizeLocaleCode } from '../../common/localization/locale-registry';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { CATEGORY_SUBCATEGORIES } from '../match/category-catalog';

const QUICK_BATTLE_ROUNDS = 10;
const ACTIVE_STATUSES = [
  QuickBattleStatus.PREPARING,
  QuickBattleStatus.READY,
  QuickBattleStatus.ACTIVE,
] as const;
const GENERATION_POLICY_VERSION = 'quick-battle-generation-v1';
const SCORING_POLICY_VERSION = 'quick-battle-scoring-pending';
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
      if (!isEnabledLocale(language)) {
        throw new BadRequestException('Unsupported Quick Battle language');
      }

      const categories = Object.keys(CATEGORY_SUBCATEGORIES);
      if (categories.length !== 23) {
        throw new Error('Quick Battle category catalog must contain exactly 23 categories');
      }
      const categoryPlan = this.shuffle(categories).slice(0, QUICK_BATTLE_ROUNDS);
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
        const round = await tx.quickBattleRound.create({
          data: {
            matchId: match.id,
            roundNumber,
            category,
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
        totalScore: true,
        generationPolicyVersion: true,
        scoringPolicyVersion: true,
        startedAt: true,
        completedAt: true,
        voidedAt: true,
        voidReason: true,
        createdAt: true,
        rounds: {
          orderBy: { roundNumber: 'asc' },
          select: {
            roundNumber: true,
            category: true,
            difficulty: true,
            questionId: true,
            startedAt: true,
            deadlineAt: true,
            completedAt: true,
            voidedAt: true,
            generationJob: { select: { status: true, lastErrorCode: true } },
          },
        },
      },
    });
    if (!match) throw new NotFoundException('Quick Battle not found');
    return match;
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
