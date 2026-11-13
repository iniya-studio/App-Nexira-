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
import {
  GeneratedQuestionValidationError,
  normalizedQuestionFingerprint,
  validateGeneratedQuestion,
} from './question-validation';

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
      // Serialize all round transitions for this match. The database row lock
      // remains effective across processes and does not rely on local timers.
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

      if (match.currentRound === 0) {
        if (
          match.status !== MatchStatus.WAITING &&
          match.status !== MatchStatus.READY
        ) {
          throw new ConflictException('Match is not ready for its first round');
        }
      } else {
        if (
          match.status !== MatchStatus.ACTIVE &&
          match.status !== MatchStatus.READY
        ) {
          throw new ConflictException('Match is not active');
        }
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

        if (previousRound.voidedAt) {
          throw new ConflictException(
            'Technical void replacements must use the question recovery workflow',
          );
        }
        if (match.status !== MatchStatus.ACTIVE) {
          throw new ConflictException('Match is not active');
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
          category: generatedQuestion.category,
          difficulty: generatedQuestion.difficulty,
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
          generatorVersion: generatedQuestion.generatorVersion,
          modelVersion: generatedQuestion.modelVersion,
          generationPolicyVersion: generatedQuestion.generationPolicyVersion,
          contentFingerprint: normalizedQuestionFingerprint(generatedQuestion),
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
   * The query deliberately does not select answerKey or gradingRubric.
   */
  async getRoundResult(
    matchId: string,
    roundId: string,
    principal: AuthenticatedPrincipal,
  ) {
    const ownership = principal.principalType === PrincipalType.USER
      ? { userId: principal.principalId }
      : { guestIdentityId: principal.principalId };
    const round = await this.prisma.round.findFirst({
      where: {
        id: roundId,
        matchId,
        match: { participants: { some: ownership } },
      },
      select: {
        id: true,
        matchId: true,
        roundNumber: true,
        startedAt: true,
        deadlineAt: true,
        completedAt: true,
        voidedAt: true,
        match: {
          select: {
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
        },
        answers: {
          select: {
            participantId: true,
            status: true,
            judgeStatus: true,
            decision: true,
            points: true,
            elapsedMs: true,
            acceptedAt: true,
          },
        },
      },
    });
    if (!round) throw new NotFoundException('Round not found');
    const self = round.match.participants.find((participant) =>
      principal.principalType === PrincipalType.USER
        ? participant.userId === principal.principalId
        : participant.guestIdentityId === principal.principalId,
    );
    if (!self) throw new NotFoundException('Round not found');

    const settled = Boolean(round.completedAt) && !round.voidedAt;
    return {
      matchId: round.matchId,
      roundId: round.id,
      roundNumber: round.roundNumber,
      status: round.voidedAt ? 'VOIDED' : round.completedAt ? 'COMPLETED' : 'ACTIVE',
      startedAt: round.startedAt,
      deadlineAt: round.deadlineAt,
      completedAt: round.completedAt,
      participants: round.match.participants.map((participant) => {
        const answer = round.answers.find((item) => item.participantId === participant.id);
        const judged = answer?.judgeStatus === 'COMPLETED' || answer?.judgeStatus === 'NOT_REQUIRED';
        return {
          type: participant.participantType,
          status: participant.status,
          ...(settled ? { score: participant.score } : {}),
          isSelf: participant.id === self.id,
          answer: settled && answer ? {
            status: answer.status,
            judgeStatus: answer.judgeStatus,
            decision: judged ? answer.decision : null,
            points: judged ? answer.points : null,
            elapsedMs: answer.elapsedMs,
            acceptedAt: answer.acceptedAt,
          } : null,
        };
      }),
    };
  }

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
      select: {
        id: true,
        matchId: true,
        roundNumber: true,
        questionId: true,
        voidedAt: true,
        startedAt: true,
        deadlineAt: true,
        question: {
          select: {
            id: true,
            answerType: true,
            canonicalPrompt: true,
            canonicalOptions: true,
            localized: true,
            timeLimitSeconds: true,
          },
        },
      },
    });

    if (
      !round?.question ||
      round.voidedAt ||
      !round.startedAt ||
      !round.deadlineAt
    ) {
      throw new NotFoundException('Round not found');
    }

    const question = round.question;
    const canonicalOptions = this.readCanonicalOptions(
      question.canonicalOptions,
    );
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

  async markRoundReady(
    matchId: string,
    roundId: string,
    principal: AuthenticatedPrincipal,
  ): Promise<{
    matchId: string;
    roundId: string;
    ready: true;
    allReady: boolean;
    startedAt: Date | null;
    deadlineAt: Date | null;
  }> {
    const ownership =
      principal.principalType === PrincipalType.USER
        ? { userId: principal.principalId }
        : { guestIdentityId: principal.principalId };

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Match" WHERE "id" = ${matchId}::uuid FOR UPDATE
      `;

      const round = await tx.round.findFirst({
        where: {
          id: roundId,
          matchId,
          match: { participants: { some: ownership } },
        },
        include: {
          question: { select: { id: true, timeLimitSeconds: true } },
          match: {
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
                },
              },
            },
          },
          readiness: {
            select: { participantId: true, isReady: true },
          },
        },
      });
      if (!round?.question) throw new NotFoundException('Round not found');

      const participant = round.match.participants.find((item) =>
        principal.principalType === PrincipalType.USER
          ? item.userId === principal.principalId
          : item.guestIdentityId === principal.principalId,
      );
      if (!participant) throw new NotFoundException('Round not found');

      const requiredParticipants = round.match.participants.filter(
        (item) =>
          item.status === ParticipantStatus.ACTIVE ||
          item.status === ParticipantStatus.DISCONNECTED,
      );
      if (Boolean(round.startedAt) !== Boolean(round.deadlineAt)) {
        throw new Error('Replacement round clock state is inconsistent');
      }
      const alreadyStarted = round.startedAt !== null;
      if (
        (alreadyStarted && round.match.status !== MatchStatus.ACTIVE) ||
        (!alreadyStarted && round.match.status !== MatchStatus.READY)
      ) {
        throw new ConflictException(
          'Match is not accepting replacement readiness',
        );
      }
      if (
        requiredParticipants.length !== 2 ||
        round.match.participants.length !== requiredParticipants.length ||
        (!alreadyStarted &&
          round.roundNumber !== round.match.currentRound + 1) ||
        (alreadyStarted && round.roundNumber !== round.match.currentRound)
      ) {
        throw new ConflictException(
          'Replacement round is not ready for participants',
        );
      }
      if (!alreadyStarted && round.readinessExpiresAt) {
        const now = await tx.$queryRaw<Array<{ now: Date }>>`
          SELECT clock_timestamp() AS "now"
        `;
        if (
          now[0]?.now instanceof Date &&
          now[0].now.getTime() >= round.readinessExpiresAt.getTime()
        ) {
          throw new ConflictException(
            'Replacement round readiness has expired',
          );
        }
      }

      const completedJob = await tx.questionGenerationJob.findFirst({
        where: {
          matchId,
          generatedQuestionId: round.question.id,
          status: 'COMPLETED',
        },
        select: { sourceRoundId: true, triggerReason: true },
      });
      if (!completedJob) {
        throw new ConflictException('Question generation is incomplete');
      }
      if (completedJob.triggerReason === 'INITIAL_MATCH') {
        if (
          completedJob.sourceRoundId !== null ||
          round.roundNumber !== 1 ||
          round.match.currentRound !== 0
        ) {
          throw new ConflictException('Initial match question state is invalid');
        }
      } else {
        if (!completedJob.sourceRoundId) {
          throw new ConflictException('Replacement question source is unavailable');
        }
        const sourceRound = await tx.round.findUnique({
          where: { id: completedJob.sourceRoundId },
          select: { roundNumber: true, completedAt: true, voidedAt: true },
        });
        const isNextRound = completedJob.triggerReason === 'NEXT_ROUND';
        if (
          !sourceRound?.completedAt ||
          sourceRound.roundNumber !== round.roundNumber - 1 ||
          (isNextRound && sourceRound.voidedAt !== null) ||
          (!isNextRound && !sourceRound.voidedAt)
        ) {
          throw new ConflictException(
            'Replacement round source does not match its generation reason',
          );
        }
      }

      const participantReadiness = round.readiness.find(
        (item) => item.participantId === participant.id,
      );
      if (!participantReadiness) {
        throw new ConflictException(
          'Participant readiness record is unavailable',
        );
      }

      if (
        !round.startedAt &&
        !round.deadlineAt &&
        !participantReadiness.isReady
      ) {
        const clock = await tx.$queryRaw<Array<{ now: Date }>>`
          SELECT clock_timestamp() AS "now"
        `;
        const readyAt = clock[0]?.now;
        if (!(readyAt instanceof Date) || Number.isNaN(readyAt.getTime())) {
          throw new Error(
            'Database clock did not return a valid readiness timestamp',
          );
        }
        await tx.roundReadiness.update({
          where: {
            roundId_participantId: {
              roundId,
              participantId: participant.id,
            },
          },
          data: { isReady: true, readyAt },
        });
      }

      const readiness = await tx.roundReadiness.findMany({
        where: { roundId },
        select: { participantId: true, isReady: true },
      });
      const allReady = requiredParticipants.every((required) =>
        readiness.some(
          (item) => item.participantId === required.id && item.isReady,
        ),
      );

      if (!round.startedAt && allReady) {
        const timestamp = await tx.$queryRaw<Array<{ now: Date }>>`
          SELECT clock_timestamp() AS "now"
        `;
        const startedAt = timestamp[0]?.now;
        if (!(startedAt instanceof Date) || Number.isNaN(startedAt.getTime())) {
          throw new Error(
            'Database clock did not return a valid round start time',
          );
        }
        const deadlineAt = new Date(
          startedAt.getTime() + round.question.timeLimitSeconds * 1000,
        );
        const updatedRound = await tx.round.updateMany({
          where: {
            id: roundId,
            matchId,
            startedAt: null,
            deadlineAt: null,
            completedAt: null,
            voidedAt: null,
          },
          data: { startedAt, deadlineAt, readinessExpiresAt: null },
        });
        const updatedMatch = await tx.match.updateMany({
          where: {
            id: matchId,
            status: MatchStatus.READY,
            currentRound: round.roundNumber - 1,
          },
          data: {
            status: MatchStatus.ACTIVE,
            currentRound: round.roundNumber,
          },
        });
        if (updatedRound.count !== 1 || updatedMatch.count !== 1) {
          throw new ConflictException('Replacement round has already started');
        }

        return {
          matchId,
          roundId,
          ready: true,
          allReady: true,
          startedAt,
          deadlineAt,
        };
      }

      return {
        matchId,
        roundId,
        ready: true,
        allReady,
        startedAt: round.startedAt,
        deadlineAt: round.deadlineAt,
      };
    });
  }

  async getQuestionRecovery(
    matchId: string,
    principal: AuthenticatedPrincipal,
  ) {
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
        status: true,
        participants: {
          select: {
            id: true,
            userId: true,
            guestIdentityId: true,
            status: true,
          },
        },
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const job = await this.prisma.questionGenerationJob.findFirst({
      where: { matchId },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        lastErrorCode: true,
        sourceRoundId: true,
        generatedQuestionId: true,
      },
    });
    if (!job) {
      return {
        matchId,
        matchStatus: match.status,
        status: 'NONE' as const,
        sourceRoundId: null,
        roundId: null,
        ready: null,
        allReady: false,
        startedAt: null,
        deadlineAt: null,
        readinessExpiresAt: null,
        lastErrorCode: null,
      };
    }

    const participant = match.participants.find((item) =>
      principal.principalType === PrincipalType.USER
        ? item.userId === principal.principalId
        : item.guestIdentityId === principal.principalId,
    );
    const round = job.generatedQuestionId
      ? await this.prisma.round.findUnique({
          where: { questionId: job.generatedQuestionId },
          select: {
            id: true,
            startedAt: true,
            deadlineAt: true,
            readinessExpiresAt: true,
            readiness: {
              select: { participantId: true, isReady: true },
            },
          },
        })
      : null;
    const requiredParticipants = match.participants.filter(
      (item) =>
        item.status === ParticipantStatus.ACTIVE ||
        item.status === ParticipantStatus.DISCONNECTED,
    );
    const allReady =
      round !== null &&
      requiredParticipants.length > 0 &&
      requiredParticipants.every((required) =>
        round.readiness.some(
          (item) => item.participantId === required.id && item.isReady,
        ),
      );

    return {
      matchId,
      matchStatus: match.status,
      status: job.status,
      sourceRoundId: job.sourceRoundId,
      roundId: round?.id ?? null,
      ready: participant
        ? (round?.readiness.find(
            (item) => item.participantId === participant.id,
          )?.isReady ?? null)
        : null,
      allReady,
      startedAt: round?.startedAt ?? null,
      deadlineAt: round?.deadlineAt ?? null,
      readinessExpiresAt: round?.readinessExpiresAt ?? null,
      lastErrorCode: job.lastErrorCode,
    };
  }

  private assertParticipantPolicy(match: MatchForRound): void {
    const active = match.participants.filter(
      (participant) => participant.status === ParticipantStatus.ACTIVE,
    );
    if (match.participants.length !== 2 || active.length !== 2) {
      throw new ConflictException(
        'V1 matches require exactly two active participants',
      );
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
      throw new ConflictException(
        'Participant composition does not match the V1 mode',
      );
    }
  }

  private validateQuestion(question: GeneratedQuestion): void {
    try {
      validateGeneratedQuestion(question);
    } catch (error) {
      if (error instanceof GeneratedQuestionValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private readCanonicalOptions(
    value: Prisma.JsonValue | null,
  ): CanonicalOption[] {
    if (value === null) return [];
    if (!Array.isArray(value))
      throw new Error('Stored question options are invalid');
    return value.map((item) => {
      const option = this.asRecord(item);
      if (typeof option?.id !== 'string' || typeof option.text !== 'string') {
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
