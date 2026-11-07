import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AnswerStatus,
  JudgeStatus,
  MatchMode,
  MatchStatus,
  ParticipantStatus,
  ParticipantType,
  PrincipalType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { judgeMultipleChoiceAnswer } from './scoring.policy';

export type AnswerReceipt = {
  answerId: string;
  matchId: string;
  roundId: string;
  acceptedAt: Date;
  elapsedMs: number;
  status: 'ACCEPTED';
};

type SubmissionRound = Prisma.RoundGetPayload<{
  select: {
    id: true;
    matchId: true;
    roundNumber: true;
    startedAt: true;
    deadlineAt: true;
    completedAt: true;
    question: {
      select: {
        answerType: true;
        canonicalOptions: true;
      };
    };
    match: {
      select: {
        status: true;
        currentRound: true;
        participants: {
          select: {
            id: true;
            userId: true;
            guestIdentityId: true;
            participantType: true;
            status: true;
          };
        };
      };
    };
  };
}>;

@Injectable()
export class AnswerService {
  constructor(private readonly prisma: PrismaService) {}

  async submitAnswer(
    matchId: string,
    roundId: string,
    principal: AuthenticatedPrincipal,
    responseText: string,
    idempotencyKey: string,
  ): Promise<AnswerReceipt> {
    const input = this.validateInput(responseText, idempotencyKey);

    return this.prisma.$transaction(async (tx) => {
      // A single row lock serializes answer/timeout races for this round,
      // including requests handled by different backend instances.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Round"
        WHERE "id" = ${roundId}::uuid
          AND "matchId" = ${matchId}::uuid
        FOR UPDATE
      `;

      const round = await tx.round.findFirst({
        where: { id: roundId, matchId },
        select: {
          id: true,
          matchId: true,
          roundNumber: true,
          startedAt: true,
          deadlineAt: true,
          completedAt: true,
          question: {
            select: {
              answerType: true,
              canonicalOptions: true,
              answerKey: true,
            },
          },
          match: {
            select: {
              mode: true,
              status: true,
              currentRound: true,
              participants: {
                select: {
                  id: true,
                  userId: true,
                  guestIdentityId: true,
                  participantType: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      if (!round?.question) throw new NotFoundException('Round not found');
      const participant = this.findHumanParticipant(round, principal);
      if (!participant) throw new NotFoundException('Round not found');
      if (
        round.match.mode !== MatchMode.ONE_V_ONE &&
        round.match.mode !== MatchMode.ONE_V_AI
      ) {
        throw new ConflictException('This match mode is not available in V1');
      }

      // Idempotent retries are replayed even if the round has since closed.
      const existingByKey = await tx.answer.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: {
          id: true,
          matchId: true,
          roundId: true,
          participantId: true,
          responseText: true,
          status: true,
          acceptedAt: true,
          elapsedMs: true,
        },
      });

      if (existingByKey) {
        if (
          existingByKey.matchId === matchId &&
          existingByKey.roundId === roundId &&
          existingByKey.participantId === participant.id &&
          existingByKey.responseText === input.responseText &&
          existingByKey.status === AnswerStatus.ANSWERED
        ) {
          return this.toReceipt(existingByKey);
        }
        throw new ConflictException('Idempotency key was already used for another request');
      }

      if (
        participant.status !== ParticipantStatus.ACTIVE ||
        round.completedAt ||
        round.match.status !== MatchStatus.ACTIVE ||
        round.match.currentRound !== round.roundNumber ||
        !round.startedAt ||
        !round.deadlineAt
      ) {
        throw new ConflictException('Round is not accepting answers');
      }

      const existingForParticipant = await tx.answer.findUnique({
        where: {
          roundId_participantId: {
            roundId,
            participantId: participant.id,
          },
        },
        select: { id: true },
      });
      if (existingForParticipant) {
        throw new ConflictException('An answer has already been submitted for this round');
      }

      this.validateResponseForQuestion(input.responseText, round.question);

      const clock = await tx.$queryRaw<Array<{ now: Date }>>`
        SELECT clock_timestamp() AS "now"
      `;
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

      // Multiple-choice questions have an exact, deterministic server-side judge.
      // Free-text answers remain pending until the AI Judge adapter is executed.
      const mcqDecision =
        round.question.answerType === 'MULTIPLE_CHOICE'
          ? judgeMultipleChoiceAnswer(
              input.responseText,
              round.question.answerKey,
              elapsedMs,
            )
          : null;

      const answer = await tx.answer.create({
        data: {
          matchId,
          roundId,
          participantId: participant.id,
          responseText: input.responseText,
          status: AnswerStatus.ANSWERED,
          judgeStatus: mcqDecision ? JudgeStatus.COMPLETED : JudgeStatus.PENDING,
          decision: mcqDecision?.decision ?? null,
          confidence: mcqDecision ? 1 : null,
          points: mcqDecision?.points ?? 0,
          speedBonus: mcqDecision?.speedBonus ?? 0,
          judgeReason: mcqDecision?.judgeReason ?? null,
          judgeVersion: mcqDecision?.judgeVersion ?? null,
          elapsedMs,
          idempotencyKey: input.idempotencyKey,
          acceptedAt,
        },
        select: {
          id: true,
          matchId: true,
          roundId: true,
          acceptedAt: true,
          elapsedMs: true,
        },
      });

      if (mcqDecision && mcqDecision.points > 0) {
        await tx.matchParticipant.update({
          where: { id: participant.id },
          data: { score: { increment: mcqDecision.points } },
        });
      }

      return this.toReceipt(answer);
    });
  }

  private validateInput(
    responseText: string,
    idempotencyKey: string,
  ): { responseText: string; idempotencyKey: string } {
    if (typeof responseText !== 'string') {
      throw new BadRequestException('Answer response must be text');
    }
    const normalizedResponse = responseText.trim();
    if (!normalizedResponse || normalizedResponse.length > 2000) {
      throw new BadRequestException('Answer response must contain 1 to 2000 characters');
    }
    if (typeof idempotencyKey !== 'string') {
      throw new BadRequestException('Idempotency key is required');
    }
    const normalizedKey = idempotencyKey.trim();
    if (normalizedKey.length < 8 || normalizedKey.length > 128) {
      throw new BadRequestException('Idempotency key must contain 8 to 128 characters');
    }
    return { responseText: normalizedResponse, idempotencyKey: normalizedKey };
  }

  private findHumanParticipant(
    round: SubmissionRound,
    principal: AuthenticatedPrincipal,
  ) {
    return round.match.participants.find((participant) => {
      if (participant.participantType !== ParticipantType.HUMAN) {
        return false;
      }
      return principal.principalType === PrincipalType.USER
        ? participant.userId === principal.principalId
        : participant.guestIdentityId === principal.principalId;
    });
  }

  private validateResponseForQuestion(
    responseText: string,
    question: NonNullable<SubmissionRound['question']>,
  ): void {
    if (question.answerType === 'FREE_TEXT') return;

    if (question.answerType !== 'MULTIPLE_CHOICE') {
      throw new ConflictException('This question answer type is not supported');
    }

    const options = question.canonicalOptions;
    if (!Array.isArray(options)) {
      throw new Error('Stored multiple-choice question options are invalid');
    }

    const optionIds = options.map((value) => {
      if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value) ||
        typeof (value as Record<string, unknown>).id !== 'string'
      ) {
        throw new Error('Stored multiple-choice question option is invalid');
      }
      return (value as Record<string, string>).id;
    });

    if (!optionIds.includes(responseText)) {
      throw new BadRequestException('Answer must reference a valid option ID');
    }
  }

  private toReceipt(answer: {
    id: string;
    matchId: string;
    roundId: string;
    acceptedAt: Date;
    elapsedMs: number;
  }): AnswerReceipt {
    return {
      answerId: answer.id,
      matchId: answer.matchId,
      roundId: answer.roundId,
      acceptedAt: answer.acceptedAt,
      elapsedMs: answer.elapsedMs,
      status: 'ACCEPTED',
    };
  }
}
