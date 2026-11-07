import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AnswerStatus,
  JudgeStatus,
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
    },
    match: {
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
    };
    prisma = {
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    service = new AnswerService(prisma as unknown as PrismaService);
  });

  it('accepts an answer using the database timestamp and keeps adjudication pending', async () => {
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
        judgeStatus: JudgeStatus.PENDING,
        points: 0,
        speedBonus: 0,
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
