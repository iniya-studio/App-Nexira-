import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MatchMode, MatchStatus, ParticipantType, PrincipalType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { questionGenerationInputForMatch } from './question-generation.context';

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

type AiMatchOptions = { category?: string; language?: string };
type MatchQuestionSettings = typeof INITIAL_QUESTION_SETTINGS & { language?: string };

@Injectable()
export class MatchService {
  constructor(private readonly prisma: PrismaService) {}

  async createAiMatch(
    principal: AuthenticatedPrincipal,
    options: AiMatchOptions = {},
  ) {
    return this.createMatchWithInitialQuestion(
      MatchMode.ONE_V_AI,
      [
        this.humanParticipantData(principal),
        { participantKey: 'ai:default-v1', participantType: ParticipantType.AI },
      ],
      principal,
      {
        ...INITIAL_QUESTION_SETTINGS,
        category: options.category?.trim() || INITIAL_QUESTION_SETTINGS.category,
        language: options.language,
      },
    );
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
      [this.humanParticipantData(first), this.humanParticipantData(second)],
      first,
      {
        ...INITIAL_QUESTION_SETTINGS,
        category: options.category?.trim() || INITIAL_QUESTION_SETTINGS.category,
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
      const language = questionSettings.language?.trim() || preferredLanguage?.preferredLanguage?.trim() || 'en';
      const match = await tx.match.create({
        data: {
          mode,
          status: MatchStatus.WAITING,
          roundsTarget: configuredV1MatchRounds(),
          participants: { create: participants },
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
            score: true,
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
          score: participant.score,
          isSelf,
          displayName: isSelf ? 'YOU' : 'OPPONENT',
        };
      }),
    };
  }

  private humanParticipantData(principal: AuthenticatedPrincipal) {
    return {
      participantKey: `human:${principal.principalType.toLowerCase()}:${principal.principalId}`,
      participantType: ParticipantType.HUMAN,
      ...(principal.principalType === PrincipalType.USER
        ? { userId: principal.principalId }
        : { guestIdentityId: principal.principalId }),
    };
  }

  private toMatchSummary(match: {
    id: string;
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
