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

@Injectable()
export class MatchService {
  constructor(private readonly prisma: PrismaService) {}

  async createAiMatch(principal: AuthenticatedPrincipal) {
    return this.createMatchWithInitialQuestion(
      MatchMode.ONE_V_AI,
      [
        this.humanParticipantData(principal),
        { participantKey: 'ai:default-v1', participantType: ParticipantType.AI },
      ],
      principal,
    );
  }

  // Internal entry point for the future matchmaking service. It is deliberately
  // not exposed as a public route until queue and pairing rules are implemented.
  async createOneVsOne(first: AuthenticatedPrincipal, second: AuthenticatedPrincipal) {
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
    );
  }

  private async createMatchWithInitialQuestion(
    mode: MatchMode,
    participants: Prisma.MatchParticipantCreateWithoutMatchInput[],
    languagePrincipal: AuthenticatedPrincipal,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const preferredLanguage =
        languagePrincipal.principalType === PrincipalType.USER
          ? await tx.user.findUnique({
              where: { id: languagePrincipal.principalId },
              select: { preferredLanguage: true },
            })
          : null;
      const language = preferredLanguage?.preferredLanguage?.trim() || 'en';
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
        { ...INITIAL_QUESTION_SETTINGS, language },
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
    });
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
        participants: { select: { participantType: true, status: true } },
      },
    });

    if (!match) throw new NotFoundException('Match not found');
    return this.toMatchSummary(match);
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
