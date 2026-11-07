import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MatchMode,
  MatchStatus,
  ParticipantStatus,
  ParticipantType,
  PrincipalType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import {
  CanonicalOption,
  GeneratedQuestion,
  PublicRoundQuestion,
} from './question.types';

type MatchForRound = Prisma.MatchGetPayload<{
  include: {
    participants: {
      select: {
        participantType: true;
        status: true;
      };
    };
  };
}>;

type RoundWithQuestion = Prisma.RoundGetPayload<{
  include: { question: true };
}>;

@Injectable()
export class RoundService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists one canonical question and one shared round clock.
   * The question package is supplied by the AI/question-generation port;
   * this service owns persistence and lifecycle, not provider selection.
   */
  async startNextRound(
    matchId: string,
    generatedQuestion: GeneratedQuestion,
  ): Promise<{
    matchId: string;
    roundId: string;
    roundNumber: number;
    questionId: string;
    startedAt: Date;
    deadlineAt: Date;
  }> {
    this.validateQuestion(generatedQuestion);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Match"
        WHERE "id" = ${matchId}::uuid
        FOR UPDATE
      `;

      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: {
          participants: {
            select: { participantType: true, status: true },
          },
        },
      });
      if (!match) throw new NotFoundException('Match not found');
      this.assertParticipantPolicy(match);

      if (
        match.status === MatchStatus.COMPLETED ||
        match.status === MatchStatus.CANCELLED
      ) {
        throw new ConflictException('Match cannot accept another round');
      }

      if (match.currentRound > 0) {
        const previousRound = await tx.round.findUnique({
          where: {
            matchId_roundNumber: {
              matchId,
              roundNumber: match.currentRound,
            },
          },
        });
        if (!previousRound?.completedAt) {
          throw new ConflictException('The previous round is not finalized');
        }
      }

      const clock = await tx.$queryRaw<Array<{ now: Date }>>`
        SELECT clock_timestamp() AS "now"
      `;
      const startedAt = clock[0]?.now;
      if (!(startedAt instanceof Date) || Number.isNaN(startedAt.getTime())) {
        throw new Error('Database clock did not return a valid timestamp');
      }
      const deadlineAt = new Date(
        startedAt.getTime() + generatedQuestion.timeLimitSeconds * 1000,
      );

      const question = await tx.question.create({
        data: {
          canonicalLanguage: generatedQuestion.canonicalLanguage,
          answerType: generatedQuestion.answerType,
          canonicalPrompt: generatedQuestion.canonicalPrompt,
          canonicalOptions:
            generatedQuestion.canonicalOptions === null
              ? Prisma.DbNull
              : (generatedQuestion.canonicalOptions as unknown as Prisma.InputJsonValue),
          answerKey: generatedQuestion.answerKey,
          gradingRubric: generatedQuestion.gradingRubric,
          localized: generatedQuestion.localized,
          timeLimitSeconds: generatedQuestion.timeLimitSeconds,
          contentVersion: generatedQuestion.contentVersion,
          judgeVersion: generatedQuestion.judgeVersion,
        },
      });

      const roundNumber = match.currentRound + 1;
      const round = await tx.round.create({
        data: {
          matchId,
          roundNumber,
          questionId: question.id,
          startedAt,
          deadlineAt,
        },
      });

      await tx.match.update({
        where: { id: matchId },
        data: {
          status: MatchStatus.ACTIVE,
          currentRound: roundNumber,
          startedAt: match.startedAt ?? startedAt,
        },
      });

      return {
        matchId,
        roundId: round.id,
        roundNumber,
        questionId: question.id,
        startedAt,
        deadlineAt,
      };
    });
  }

  /**
   * Returns a participant-specific localized view of the shared question.
   * Canonical option IDs and order are retained; private answer material is
   * never selected into or serialized from this DTO.
   */
  async getRoundQuestion(
    matchId: string,
    roundId: string,
    principal: AuthenticatedPrincipal,
    language: string,
  ): Promise<PublicRoundQuestion> {
    const ownership =
      principal.principalType === PrincipalType.USER
        ? { userId: principal.principalId }
        : { guestIdentityId: principal.principalId };

    const round = await this.prisma.round.findFirst({
      where: {
        id: roundId,
        matchId,
        match: { participants: { some: ownership } },
      },
      include: { question: true },
    });

    if (!round?.question || !round.startedAt || !round.deadlineAt) {
      throw new NotFoundException('Round not found');
    }

    const question = round.question;
    const canonicalOptions = this.readCanonicalOptions(question.canonicalOptions);
    const localizedRoot = this.asRecord(question.localized);
    const localized = this.asRecord(localizedRoot?.[language]);
    const localizedOptions = this.asRecord(localized?.options);

    return {
      matchId,
      roundId: round.id,
      roundNumber: round.roundNumber,
      questionId: question.id,
      answerType: question.answerType,
      prompt:
        typeof localized?.prompt === 'string'
          ? localized.prompt
          : question.canonicalPrompt,
      options: canonicalOptions.map((option) => ({
        id: option.id,
        text:
          typeof localizedOptions?.[option.id] === 'string'
            ? (localizedOptions[option.id] as string)
            : option.text,
      })),
      timeLimitSeconds: question.timeLimitSeconds,
      startedAt: round.startedAt,
      deadlineAt: round.deadlineAt,
    };
  }

  private assertParticipantPolicy(match: MatchForRound): void {
    const active = match.participants.filter(
      (participant) => participant.status === ParticipantStatus.ACTIVE,
    );
    if (active.length !== 2) {
      throw new ConflictException('V1 matches require exactly two active participants');
    }

    const humans = active.filter(
      (participant) => participant.participantType === ParticipantType.HUMAN,
    ).length;
    const ai = active.filter(
      (participant) => participant.participantType === ParticipantType.AI,
    ).length;

    if (
      (match.mode === MatchMode.ONE_V_ONE && (humans !== 2 || ai !== 0)) ||
      (match.mode === MatchMode.ONE_V_AI && (humans !== 1 || ai !== 1)) ||
      match.mode === MatchMode.ROOM
    ) {
      throw new ConflictException('Participant composition does not match the V1 mode');
    }
  }

  private validateQuestion(question: GeneratedQuestion): void {
    if (
      !question.canonicalLanguage.trim() ||
      !question.canonicalPrompt.trim() ||
      !question.answerKey.trim() ||
      !question.contentVersion.trim() ||
      !Number.isSafeInteger(question.timeLimitSeconds) ||
      question.timeLimitSeconds < 1 ||
      question.timeLimitSeconds > 300
    ) {
      throw new BadRequestException('Generated question package is invalid');
    }

    if (question.answerType === 'MULTIPLE_CHOICE') {
      const options = question.canonicalOptions;
      if (
        !Array.isArray(options) ||
        options.length < 2 ||
        options.some(
          (option) =>
            !option.id?.trim() ||
            !option.text?.trim() ||
            typeof option.id !== 'string' ||
            typeof option.text !== 'string',
        ) ||
        new Set(options.map((option) => option.id)).size !== options.length ||
        !options.some((option) => option.id === question.answerKey)
      ) {
        throw new BadRequestException('Multiple-choice question options are invalid');
      }
    } else if (question.answerType === 'FREE_TEXT') {
      if (question.canonicalOptions !== null) {
        throw new BadRequestException('Free-text questions cannot include options');
      }
    } else {
      throw new BadRequestException('Unsupported question answer type');
    }
  }

  private readCanonicalOptions(value: Prisma.JsonValue | null): CanonicalOption[] {
    if (value === null) return [];
    if (!Array.isArray(value)) throw new Error('Stored question options are invalid');
    return value.map((item) => {
      const option = this.asRecord(item);
      if (
        typeof option?.id !== 'string' ||
        typeof option.text !== 'string'
      ) {
        throw new Error('Stored question option is invalid');
      }
      return { id: option.id, text: option.text };
    });
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }
}
