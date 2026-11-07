import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AnswerStatus,
  JudgeDecision,
  JudgeStatus,
  MatchMode,
  MatchStatus,
  ParticipantStatus,
  ParticipantType,
  PrincipalType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { AnswerService } from './answer.service';

describe('AnswerService', () => {
  const startedAt = new Date('2026-11-08T10:00:00.000Z');
  const acceptedAt = new Date('2026-11-08T10:00:04.250Z');
  const deadlineAt = new Date('2026-11-08T10:00:20.000Z');
  const principal: AuthenticatedPrincipal = {
    principalType: PrincipalType.GUEST,
    principalId: 'guest-1',
    sessionId: 'session-1',
  };

  let tx: {
    $queryRaw: jest.Mock;
    round: { findFirst: jest.Mock };
    answer: { findUnique: jest.Mock; create: jest.Mock };
    matchParticipant: { update: jest.Mock };
    matchScoreEntry: { create: jest.Mock };
  };
  let prisma: { $transaction: jest.Mock };
  let service: AnswerService;

  const roundRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'round-1',
    matchId: 'match-1',
    roundNumber: 1,
    startedAt,
    deadlineAt,
    completedAt: null,
    question: {
      answerType: 'MULTIPLE_CHOICE',
      canonicalOptions: [{ id: 'A', text: 'Alpha' }, { id: 'B', text: 'Beta' }],
      answerKey: 'B',
    },
    match: {
      mode: MatchMode.ONE_V_ONE,
      status: MatchStatus.ACTIVE,
      currentRound: 1,
      participants: [
        {
          id: 'participant-1',
          userId: null,
          guestIdentityId: principal.principalId,
          participantType: ParticipantType.HUMAN,
          status: ParticipantStatus.ACTIVE,
        },
      ],
    },
    ...overrides,
  });

  beforeEach(() => {
    tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'round-1' }])
        .mockResolvedValueOnce([{ now: acceptedAt }]),
      round: { findFirst: jest.fn().mockResolvedValue(roundRecord()) },
      answer: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'answer-1',
          matchId: 'match-1',
          roundId: 'round-1',
          acceptedAt,
          elapsedMs: 4250,
        }),
      },
      matchParticipant: { update: jest.fn().mockResolvedValue({ id: 'participant-1' }) },
      matchScoreEntry: { create: jest.fn().mockResolvedValue({ id: 'score-entry-1' }) },
    };
    prisma = {
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    service = new AnswerService(prisma as unknown as PrismaService);
  });

  it('accepts and deterministically adjudicates a correct MCQ using database elapsed time', async () => {
    const result = await service.submitAnswer(
      'match-1',
      'round-1',
      principal,
      ' B ',
      'request-key-0001',
    );

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.answer.create).toHaveBeenCalledWith({
      data: {
        matchId: 'match-1',
        roundId: 'round-1',
        participantId: 'participant-1',
        responseText: 'B',
        status: AnswerStatus.ANSWERED,
        judgeStatus: JudgeStatus.COMPLETED,
        decision: JudgeDecision.CORRECT,
        confidence: 1,
        points: 20,
        speedBonus: 10,
        judgeReason: 'CANONICAL_OPTION_ID_MATCH',
        judgeVersion: 'mcq-exact-v1',
        elapsedMs: 4250,
        idempotencyKey: 'request-key-0001',
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
    expect(result).toEqual({
      answerId: 'answer-1',
      matchId: 'match-1',
      roundId: 'round-1',
      acceptedAt,
      elapsedMs: 4250,
      status: 'ACCEPTED',
    });
    expect(result).not.toHaveProperty('decision');
    expect(result).not.toHaveProperty('points');
    expect(tx.matchParticipant.update).toHaveBeenCalledWith({
      where: { id: 'participant-1' },
      data: { score: { increment: 20 } },
    });
    expect(tx.matchScoreEntry.create).toHaveBeenCalledWith({
      data: {
        matchId: 'match-1',
        participantId: 'participant-1',
        roundId: 'round-1',
        answerId: 'answer-1',
        entryType: 'ANSWER_SCORE',
        pointsChange: 20,
        idempotencyKey: 'answer:answer-1:score:v1',
      },
    });
  });

  it('persists an incorrect MCQ decision without awarding points', async () => {
    const result = await service.submitAnswer(
      'match-1',
      'round-1',
      principal,
      'A',
      'request-key-wrong-1',
    );

    expect(result.status).toBe('ACCEPTED');
    expect(tx.answer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          judgeStatus: JudgeStatus.COMPLETED,
          decision: JudgeDecision.INCORRECT,
          confidence: 1,
          points: 0,
          speedBonus: 0,
          judgeReason: 'CANONICAL_OPTION_ID_MISMATCH',
          judgeVersion: 'mcq-exact-v1',
        }),
      }),
    );
    expect(tx.matchParticipant.update).not.toHaveBeenCalled();
    expect(tx.matchScoreEntry.create).not.toHaveBeenCalled();
  });

  it('replays the original receipt for an identical idempotent retry', async () => {
    tx.answer.findUnique.mockResolvedValue({
      id: 'answer-existing',
      matchId: 'match-1',
      roundId: 'round-1',
      participantId: 'participant-1',
      responseText: 'B',
      status: AnswerStatus.ANSWERED,
      acceptedAt,
      elapsedMs: 4250,
    });

    const result = await service.submitAnswer(
      'match-1',
      'round-1',
      principal,
      'B',
      'request-key-0001',
    );

    expect(result.answerId).toBe('answer-existing');
    expect(result.acceptedAt).toEqual(acceptedAt);
    expect(tx.answer.create).not.toHaveBeenCalled();
    expect(tx.matchParticipant.update).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of an idempotency key with a different payload', async () => {
    tx.answer.findUnique.mockResolvedValue({
      id: 'answer-existing',
      matchId: 'match-1',
      roundId: 'round-1',
      participantId: 'participant-1',
      responseText: 'A',
      status: AnswerStatus.ANSWERED,
      acceptedAt,
      elapsedMs: 4250,
    });

    await expect(
      service.submitAnswer('match-1', 'round-1', principal, 'B', 'request-key-0001'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.answer.create).not.toHaveBeenCalled();
  });

  it('rejects a second answer from the same participant with a new idempotency key', async () => {
    tx.answer.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'answer-existing' });

    await expect(
      service.submitAnswer('match-1', 'round-1', principal, 'B', 'request-key-0002'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.answer.create).not.toHaveBeenCalled();
  });

  it('rejects an answer at the exact exclusive deadline boundary', async () => {
    tx.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([{ id: 'round-1' }])
      .mockResolvedValueOnce([{ now: deadlineAt }]);

    await expect(
      service.submitAnswer('match-1', 'round-1', principal, 'B', 'request-key-0003'),
    ).rejects.toThrow('The answer deadline has passed');
    expect(tx.answer.create).not.toHaveBeenCalled();
  });

  it('rejects an option ID that is not part of the canonical question', async () => {
    await expect(
      service.submitAnswer('match-1', 'round-1', principal, 'Mars', 'request-key-0004'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.answer.create).not.toHaveBeenCalled();
  });

  it('accepts free-text responses for a free-text question', async () => {
    tx.round.findFirst.mockResolvedValue(
      roundRecord({
        question: { answerType: 'FREE_TEXT', canonicalOptions: null, answerKey: 'Mars' },
      }),
    );

    await expect(
      service.submitAnswer('match-1', 'round-1', principal, 'Mars', 'request-key-free-1'),
    ).resolves.toMatchObject({ status: 'ACCEPTED' });
    expect(tx.answer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responseText: 'Mars',
          judgeStatus: JudgeStatus.PENDING,
          decision: null,
          points: 0,
          speedBonus: 0,
        }),
      }),
    );
    expect(tx.matchParticipant.update).not.toHaveBeenCalled();
  });

  it('rejects V2 ROOM answers through the V1 answer path', async () => {
    tx.round.findFirst.mockResolvedValue(
      roundRecord({
        match: {
          mode: MatchMode.ROOM,
          status: MatchStatus.ACTIVE,
          currentRound: 1,
          participants: [
            {
              id: 'participant-1',
              userId: null,
              guestIdentityId: principal.principalId,
              participantType: ParticipantType.HUMAN,
              status: ParticipantStatus.ACTIVE,
            },
          ],
        },
      }),
    );

    await expect(
      service.submitAnswer('match-1', 'round-1', principal, 'B', 'request-key-room-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.answer.findUnique).not.toHaveBeenCalled();
  });

  it('does not accept answers from a non-participant', async () => {
    tx.round.findFirst.mockResolvedValue(
      roundRecord({
        match: {
          status: MatchStatus.ACTIVE,
          currentRound: 1,
          participants: [
            {
              id: 'participant-2',
              userId: null,
              guestIdentityId: 'other-guest',
              participantType: ParticipantType.HUMAN,
              status: ParticipantStatus.ACTIVE,
            },
          ],
        },
      }),
    );

    await expect(
      service.submitAnswer('match-1', 'round-1', principal, 'B', 'request-key-0005'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('replays an accepted answer after the participant and match are completed', async () => {
    tx.round.findFirst.mockResolvedValue(
      roundRecord({
        completedAt: acceptedAt,
        match: {
          mode: MatchMode.ONE_V_ONE,
          status: MatchStatus.COMPLETED,
          currentRound: 1,
          participants: [
            {
              id: 'participant-1',
              userId: null,
              guestIdentityId: principal.principalId,
              participantType: ParticipantType.HUMAN,
              status: ParticipantStatus.COMPLETED,
            },
          ],
        },
      }),
    );
    tx.answer.findUnique.mockResolvedValue({
      id: 'answer-finalized',
      matchId: 'match-1',
      roundId: 'round-1',
      participantId: 'participant-1',
      responseText: 'B',
      status: AnswerStatus.ANSWERED,
      acceptedAt,
      elapsedMs: 4250,
    });

    const result = await service.submitAnswer(
      'match-1',
      'round-1',
      principal,
      'B',
      'request-key-0001',
    );

    expect(result.answerId).toBe('answer-finalized');
    expect(result.acceptedAt).toEqual(acceptedAt);
    expect(tx.answer.create).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects a new answer from a completed participant', async () => {
    tx.round.findFirst.mockResolvedValue(
      roundRecord({
        completedAt: acceptedAt,
        match: {
          mode: MatchMode.ONE_V_ONE,
          status: MatchStatus.COMPLETED,
          currentRound: 1,
          participants: [
            {
              id: 'participant-1',
              userId: null,
              guestIdentityId: principal.principalId,
              participantType: ParticipantType.HUMAN,
              status: ParticipantStatus.COMPLETED,
            },
          ],
        },
      }),
    );

    await expect(
      service.submitAnswer('match-1', 'round-1', principal, 'B', 'request-key-0007'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.answer.create).not.toHaveBeenCalled();
  });

  it('rejects answers for a completed or non-current round', async () => {
    tx.round.findFirst.mockResolvedValue(
      roundRecord({
        completedAt: acceptedAt,
      }),
    );

    await expect(
      service.submitAnswer('match-1', 'round-1', principal, 'B', 'request-key-0006'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
