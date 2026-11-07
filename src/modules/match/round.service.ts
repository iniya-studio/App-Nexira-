import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MatchMode,
  MatchStatus,
  ParticipantType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RoundService {
  constructor(private readonly prisma: PrismaService) {}

  // Trusted server-side entry point. Question selection/generation must happen
  // before this call; clients never choose a question or control the deadline.
  async startFirstRound(matchId: string, questionId: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const match = await tx.match.findUnique({
            where: { id: matchId },
            select: {
              id: true,
              mode: true,
              status: true,
              currentRound: true,
              participants: { select: { participantType: true } },
            },
          });

          if (!match) throw new NotFoundException('Match not found');
          if (match.status !== MatchStatus.WAITING || match.currentRound !== 0) {
            throw new ConflictException('Match is not ready to start its first round');
          }

          this.assertValidParticipants(match.mode, match.participants);

          const question = await tx.question.findUnique({
            where: { id: questionId },
            select: { id: true, timeLimitSeconds: true },
          });
          if (!question) throw new NotFoundException('Question not found');
          if (!Number.isSafeInteger(question.timeLimitSeconds) || question.timeLimitSeconds < 1) {
            throw new BadRequestException('Question has an invalid time limit');
          }

          const clockRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
          const startedAt = clockRows[0]?.now;
          if (!(startedAt instanceof Date) || Number.isNaN(startedAt.getTime())) {
            throw new Error('Database clock did not return a valid timestamp');
          }
          const deadlineAt = new Date(startedAt.getTime() + question.timeLimitSeconds * 1000);

          const claimed = await tx.match.updateMany({
            where: { id: matchId, status: MatchStatus.WAITING, currentRound: 0 },
            data: {
              status: MatchStatus.ACTIVE,
              currentRound: 1,
              startedAt,
            },
          });
          if (claimed.count !== 1) {
            throw new ConflictException('Match was started by another operation');
          }

          const round = await tx.round.create({
            data: {
              matchId,
              roundNumber: 1,
              questionId: question.id,
              startedAt,
              deadlineAt,
            },
            select: {
              id: true,
              matchId: true,
              roundNumber: true,
              startedAt: true,
              deadlineAt: true,
            },
          });

          return round;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException('Match start conflicted with another operation');
      }
      throw error;
    }
  }

  private assertValidParticipants(
    mode: MatchMode,
    participants: { participantType: ParticipantType }[],
  ): void {
    if (participants.length !== 2) {
      throw new BadRequestException('V1 matches must contain exactly two participants');
    }

    const humanCount = participants.filter(
      (participant) => participant.participantType === ParticipantType.HUMAN,
    ).length;
    const aiCount = participants.filter(
      (participant) => participant.participantType === ParticipantType.AI,
    ).length;

    if (
      (mode === MatchMode.ONE_V_ONE && (humanCount !== 2 || aiCount !== 0)) ||
      (mode === MatchMode.ONE_V_AI && (humanCount !== 1 || aiCount !== 1)) ||
      (mode !== MatchMode.ONE_V_ONE && mode !== MatchMode.ONE_V_AI)
    ) {
      throw new BadRequestException('Participant types do not satisfy the V1 match mode');
    }
  }
}
