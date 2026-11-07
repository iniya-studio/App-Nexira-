import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MatchMode, MatchStatus, ParticipantType, PrincipalType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';

@Injectable()
export class MatchService {
  constructor(private readonly prisma: PrismaService) {}

  async createAiMatch(principal: AuthenticatedPrincipal) {
    const match = await this.prisma.match.create({
      data: {
        mode: MatchMode.ONE_V_AI,
        status: MatchStatus.WAITING,
        participants: {
          create: [
            this.humanParticipantData(principal),
            {
              participantKey: 'ai:default-v1',
              participantType: ParticipantType.AI,
            },
          ],
        },
      },
      select: {
        id: true,
        mode: true,
        status: true,
        currentRound: true,
        createdAt: true,
        participants: { select: { participantType: true, status: true } },
      },
    });

    return this.toMatchSummary(match);
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

    const match = await this.prisma.match.create({
      data: {
        mode: MatchMode.ONE_V_ONE,
        status: MatchStatus.WAITING,
        participants: {
          create: [
            this.humanParticipantData(first),
            this.humanParticipantData(second),
          ],
        },
      },
      select: {
        id: true,
        mode: true,
        status: true,
        currentRound: true,
        createdAt: true,
        participants: { select: { participantType: true, status: true } },
      },
    });

    return this.toMatchSummary(match);
  }

  async getMatch(matchId: string, principal: AuthenticatedPrincipal) {
    const ownership =
      principal.principalType === PrincipalType.USER
        ? { userId: principal.principalId }
        : { guestIdentityId: principal.principalId };

    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        participants: { some: ownership },
      },
      select: {
        id: true,
        mode: true,
        status: true,
        currentRound: true,
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
