import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MatchMode, MatchStatus, ParticipantType, PrincipalType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isEnabledLocale, normalizeLocaleCode } from '../../common/localization/locale-registry';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { questionGenerationInputForMatch } from './question-generation.context';
import { isSupportedCategorySelection } from './category-catalog';

// Snapshot match length at creation; deployment changes never alter active matches.
const DEFAULT_V1_MATCH_ROUNDS = 10;
const SUPPORTED_V1_MATCH_ROUNDS = new Set([10, 15]);
const configuredV1MatchRounds = (): number => {
  const configured = Number(process.env.NEXIRA_MATCH_ROUNDS ?? DEFAULT_V1_MATCH_ROUNDS);
  if (!SUPPORTED_V1_MATCH_ROUNDS.has(configured)) {
    throw new Error('NEXIRA_MATCH_ROUNDS must be either 10 or 15');
  }
  return configured;
};

const INITIAL_QUESTION_SETTINGS = {
  category: 'general',
  difficulty: 'medium',
  answerType: 'FREE_TEXT' as const,
  timeLimitSeconds: 30,
};

type AiMatchOptions = { category?: string; subcategoryId?: string; language?: string; participantLanguages?: { first: string; second: string } };
type MatchQuestionSettings = typeof INITIAL_QUESTION_SETTINGS & { language?: string; subcategoryId?: string };

@Injectable()
export class MatchService {
  constructor(private readonly prisma: PrismaService) {}

  async createAiMatch(
    principal: AuthenticatedPrincipal,
    options: AiMatchOptions = {},
  ) {
    const category = options.category?.trim().toLowerCase() || INITIAL_QUESTION_SETTINGS.category;
    const subcategoryId = options.subcategoryId?.trim().toLowerCase() || null;
    if (!isSupportedCategorySelection(category, subcategoryId)) {
      throw new BadRequestException('Unsupported match category or subcategory');
    }
    return this.prisma.$transaction(async (tx) => {
      // Serialize retries/concurrent starts for one principal so a lost POST
      // response cannot leave multiple active 1vAI matches behind.
      const principalLock = `nexira:1vai:principal:${principal.principalType}:${principal.principalId}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${principalLock})) IS NULL AS locked`;

      const ownership = principal.principalType === PrincipalType.USER
        ? { userId: principal.principalId }
        : { guestIdentityId: principal.principalId };
      const existing = await tx.match.findFirst({
        where: {
          mode: MatchMode.ONE_V_AI,
          status: { in: [MatchStatus.WAITING, MatchStatus.READY, MatchStatus.ACTIVE] },
          participants: { some: ownership },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          mode: true,
          status: true,
          category: true,
          subcategoryId: true,
          currentRound: true,
          roundsTarget: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
          participants: { select: { participantType: true, status: true } },
        },
      });
      if (existing) return this.toMatchSummary(existing);

      const preferredLanguage = principal.principalType === PrincipalType.USER
        ? (await tx.user.findUnique({ where: { id: principal.principalId }, select: { preferredLanguage: true } }))?.preferredLanguage
        : null;
      const participantLanguage = normalizeLocaleCode(preferredLanguage?.trim() || options.language?.trim() || 'en');
      if (!isEnabledLocale(participantLanguage)) {
        throw new BadRequestException('Unsupported match language');
      }

      return this.createMatchWithInitialQuestion(
        MatchMode.ONE_V_AI,
        [
          this.humanParticipantData(principal, participantLanguage),
          { participantKey: 'ai:default-v1', participantType: ParticipantType.AI },
        ],
        principal,
        {
          ...INITIAL_QUESTION_SETTINGS,
          category,
          subcategoryId: subcategoryId ?? undefined,
          language: participantLanguage,
        },
        tx,
      );
    });
  }

  // Shared 1v1 creation primitive. Public callers must go through MatchmakingService,
  // which supplies the transaction that atomically consumes both queue entries.
  async createOneVsOne(
    first: AuthenticatedPrincipal,
    second: AuthenticatedPrincipal,
    transaction?: Prisma.TransactionClient,
    options: AiMatchOptions = {},
  ) {
    if (
      first.principalType === second.principalType &&
      first.principalId === second.principalId
    ) {
      throw new BadRequestException('A participant cannot be matched against themselves');
    }

    return this.createMatchWithInitialQuestion(
      MatchMode.ONE_V_ONE,
      [
        this.humanParticipantData(first, options.participantLanguages?.first || options.language || 'en'),
        this.humanParticipantData(second, options.participantLanguages?.second || options.language || 'en'),
      ],
      first,
      {
        ...INITIAL_QUESTION_SETTINGS,
        category: options.category?.trim().toLowerCase() || INITIAL_QUESTION_SETTINGS.category,
        subcategoryId: options.subcategoryId?.trim().toLowerCase() || undefined,
        language: options.language,
      },
      transaction,
    );
  }

  private async createMatchWithInitialQuestion(
    mode: MatchMode,
    participants: Prisma.MatchParticipantCreateWithoutMatchInput[],
    languagePrincipal: AuthenticatedPrincipal,
    questionSettings: MatchQuestionSettings = INITIAL_QUESTION_SETTINGS,
    transaction?: Prisma.TransactionClient,
  ) {
    const create = async (tx: Prisma.TransactionClient) => {
      const preferredLanguage =
        languagePrincipal.principalType === PrincipalType.USER
          ? await tx.user.findUnique({
              where: { id: languagePrincipal.principalId },
              select: { preferredLanguage: true },
            })
          : null;
      const language = normalizeLocaleCode(questionSettings.language?.trim() || preferredLanguage?.preferredLanguage?.trim() || 'en');
      if (!isEnabledLocale(language)) {
        throw new BadRequestException('Unsupported match language');
      }
      const normalizedParticipants = participants.map((participant) => {
        if (participant.participantType !== ParticipantType.HUMAN) return participant;
        const participantLanguage = normalizeLocaleCode(String(participant.language ?? ''));
        if (!isEnabledLocale(participantLanguage)) {
          throw new BadRequestException('Unsupported participant language');
        }
        return { ...participant, language: participantLanguage };
      });
      const match = await tx.match.create({
        data: {
          mode,
          status: MatchStatus.WAITING,
          category: questionSettings.category,
          subcategoryId: questionSettings.subcategoryId ?? null,
          roundsTarget: configuredV1MatchRounds(),
          participants: { create: normalizedParticipants },
        },
        select: {
          id: true,
          mode: true,
          status: true,
          currentRound: true,
          roundsTarget: true,
          createdAt: true,
          participants: {
            select: { participantKey: true, participantType: true, status: true },
          },
        },
      });

      const requestContext = await questionGenerationInputForMatch(
        tx,
        match.id,
        { ...questionSettings, language },
      );
      await tx.questionGenerationJob.create({
        data: {
          matchId: match.id,
          sourceRoundId: null,
          triggerReason: 'INITIAL_MATCH',
          requestContext: requestContext as Prisma.InputJsonValue,
          idempotencyKey: `match:${match.id}:initial-question:v1`,
          maxAttempts: 3,
        },
      });

      return this.toMatchSummary(match);
    };
    return transaction ? create(transaction) : this.prisma.$transaction(create);
  }

  /**
   * Exposes only server-persisted participant score aggregates to match participants.
   * Answer content, judge decisions, and question internals are intentionally excluded.
   */
  async getLiveScoreboard(matchId: string, principal: AuthenticatedPrincipal) {
    const ownership = principal.principalType === PrincipalType.USER
      ? { userId: principal.principalId }
      : { guestIdentityId: principal.principalId };
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, participants: { some: ownership } },
      select: {
        id: true,
        status: true,
        currentRound: true,
        participants: {
          select: {
            id: true,
            userId: true,
            guestIdentityId: true,
            participantType: true,
            status: true,
            score: true,
          },
        },
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    const self = match.participants.find((participant) =>
      principal.principalType === PrincipalType.USER
        ? participant.userId === principal.principalId
        : participant.guestIdentityId === principal.principalId,
    );
    if (!self) throw new NotFoundException('Match not found');

    return {
      matchId: match.id,
      status: match.status,
      currentRound: match.currentRound,
      participants: match.participants.map((participant) => ({
        type: participant.participantType,
        status: participant.status,
        score: participant.score,
        isSelf: participant.id === self.id,
      })),
    };
  }

  async getMatchResult(matchId: string, principal: AuthenticatedPrincipal) {
    const ownership = principal.principalType === PrincipalType.USER
      ? { userId: principal.principalId }
      : { guestIdentityId: principal.principalId };
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, participants: { some: ownership } },
      select: {
        id: true,
        mode: true,
        status: true,
        roundsTarget: true,
        currentRound: true,
        completedAt: true,
        participants: {
          select: {
            id: true,
            userId: true,
            guestIdentityId: true,
            participantType: true,
            status: true,
            score: true,
          },
        },
        result: { select: { winnerParticipantId: true, resultSummary: true } },
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const self = match.participants.find((participant) =>
      principal.principalType === PrincipalType.USER
        ? participant.userId === principal.principalId
        : participant.guestIdentityId === principal.principalId,
    );
    if (!self) throw new NotFoundException('Match not found');
    const completed = match.status === MatchStatus.COMPLETED && Boolean(match.result);
    const winner = completed
      ? match.participants.find(
          (participant) => participant.id === match.result?.winnerParticipantId,
        )
      : undefined;
    const summary = completed ? match.result?.resultSummary : null;
    const outcome = typeof summary === 'object' && summary !== null && !Array.isArray(summary)
      && typeof (summary as Record<string, unknown>).outcome === 'string'
      ? (summary as Record<string, unknown>).outcome as string
      : null;

    return {
      matchId: match.id,
      mode: match.mode,
      status: match.status,
      completed,
      currentRound: match.currentRound,
      roundsTarget: match.roundsTarget,
      completedAt: match.completedAt,
      outcome,
      winnerType: completed ? winner?.participantType ?? null : null,
      youWon: completed ? (winner ? winner.id === self.id : null) : null,
      participants: match.participants.map((participant) => ({
        type: participant.participantType,
        status: participant.status,
        ...(match.status === MatchStatus.COMPLETED && match.result
          ? { score: participant.score }
          : {}),
        isSelf: participant.id === self.id,
      })),
    };
  }

  async getActiveAiMatch(principal: AuthenticatedPrincipal) {
    const ownership = principal.principalType === PrincipalType.USER
      ? { userId: principal.principalId }
      : { guestIdentityId: principal.principalId };
    const match = await this.prisma.match.findFirst({
      where: {
        mode: MatchMode.ONE_V_AI,
        status: { in: [MatchStatus.WAITING, MatchStatus.READY, MatchStatus.ACTIVE] },
        participants: { some: ownership },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return match ? this.getMatch(match.id, principal) : null;
  }

  async getMatch(matchId: string, principal: AuthenticatedPrincipal) {
    const ownership =
      principal.principalType === PrincipalType.USER
        ? { userId: principal.principalId }
        : { guestIdentityId: principal.principalId };

    const match = await this.prisma.match.findFirst({
      where: { id: matchId, participants: { some: ownership } },
      select: {
        id: true,
        mode: true,
        status: true,
        category: true,
        subcategoryId: true,
        currentRound: true,
        roundsTarget: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        participants: {
          select: {
            id: true,
            participantType: true,
            status: true,
            userId: true,
            guestIdentityId: true,
          },
        },
      },
    });

    if (!match) throw new NotFoundException('Match not found');
    return {
      ...this.toMatchSummary(match),
      participants: match.participants.map((participant) => {
        const isSelf = principal.principalType === PrincipalType.USER
          ? participant.userId === principal.principalId
          : participant.guestIdentityId === principal.principalId;
        return {
          id: participant.id,
          type: participant.participantType,
          status: participant.status,
          isSelf,
          displayName: isSelf ? 'YOU' : 'OPPONENT',
        };
      }),
    };
  }

  private humanParticipantData(principal: AuthenticatedPrincipal, language: string) {
    return {
      language,
      participantKey: `human:${principal.principalType.toLowerCase()}:${principal.principalId}`,
      participantType: ParticipantType.HUMAN,
      ...(principal.principalType === PrincipalType.USER
        ? { userId: principal.principalId }
        : { guestIdentityId: principal.principalId }),
    };
  }

  private toMatchSummary(match: {
    id: string;
    category?: string;
    subcategoryId?: string | null;
    mode: MatchMode;
    status: MatchStatus;
    currentRound: number;
    roundsTarget: number;
    createdAt: Date;
    startedAt?: Date | null;
    completedAt?: Date | null;
    participants: { participantType: ParticipantType; status: string }[];
  }) {
    return {
      id: match.id,
      category: match.category ?? 'general',
      subcategoryId: match.subcategoryId ?? null,
      mode: match.mode,
      status: match.status,
      currentRound: match.currentRound,
      roundsTarget: match.roundsTarget,
      createdAt: match.createdAt,
      startedAt: match.startedAt ?? null,
      completedAt: match.completedAt ?? null,
      participants: match.participants.map((participant) => ({
        type: participant.participantType,
        status: participant.status,
      })),
    };
  }
}
