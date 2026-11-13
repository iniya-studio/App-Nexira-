import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  MatchMode,
  MatchStatus,
  ParticipantStatus,
  ParticipantType,
  PrincipalType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { GeneratedQuestion } from './question.types';
import { RoundService } from './round.service';

describe('RoundService', () => {
  const startedAt = new Date('2026-11-08T10:00:00.000Z');
  const principal: AuthenticatedPrincipal = {
    principalType: PrincipalType.GUEST,
    principalId: 'guest-1',
    sessionId: 'session-1',
  };
  const question: GeneratedQuestion = {
    category: 'general',
    difficulty: 'medium',
    canonicalLanguage: 'en',
    answerType: 'MULTIPLE_CHOICE',
    canonicalPrompt: 'Canonical prompt',
    canonicalOptions: [
      { id: 'A', text: 'Canonical A' },
      { id: 'B', text: 'Canonical B' },
    ],
    answerKey: 'B',
    gradingRubric: { type: 'exact-option' },
    localized: {
      en: {
        prompt: 'English prompt',
        options: { A: 'English A', B: 'English B' },
      },
      fa: { prompt: 'پرسش فارسی', options: { A: 'گزینه الف', B: 'گزینه ب' } },
    },
    timeLimitSeconds: 20,
    contentVersion: 'test-v1',
  };

  let tx: {
    $queryRaw: jest.Mock;
    match: { findUnique: jest.Mock; update: jest.Mock };
    question: { create: jest.Mock };
    round: { create: jest.Mock; findUnique: jest.Mock };
  };
  let prisma: { $transaction: jest.Mock; round: { findFirst: jest.Mock } };
  let service: RoundService;

  beforeEach(() => {
    tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'match-1' }])
        .mockResolvedValueOnce([{ now: startedAt }]),
      match: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'match-1',
          mode: MatchMode.ONE_V_AI,
          status: MatchStatus.WAITING,
          currentRound: 0,
          startedAt: null,
          participants: [
            {
              participantType: ParticipantType.HUMAN,
              status: ParticipantStatus.ACTIVE,
            },
            {
              participantType: ParticipantType.AI,
              status: ParticipantStatus.ACTIVE,
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({ id: 'match-1' }),
      },
      question: { create: jest.fn().mockResolvedValue({ id: 'question-1' }) },
      round: {
        create: jest.fn().mockResolvedValue({ id: 'round-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    prisma = {
      $transaction: jest.fn(
        async (callback: (transaction: typeof tx) => unknown) => callback(tx),
      ),
      round: { findFirst: jest.fn() },
    };
    service = new RoundService(prisma as unknown as PrismaService);
  });

  it('creates one persisted question and one shared server deadline for 1vAI', async () => {
    const result = await service.startNextRound('match-1', question);

    expect(tx.question.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          answerKey: 'B',
          canonicalLanguage: 'en',
          timeLimitSeconds: 20,
        }),
      }),
    );
    expect(tx.round.create).toHaveBeenCalledWith({
      data: {
        matchId: 'match-1',
        roundNumber: 1,
        questionId: 'question-1',
        startedAt,
        deadlineAt: new Date(startedAt.getTime() + 20_000),
      },
    });
    expect(tx.match.update).toHaveBeenCalledWith({
      where: { id: 'match-1' },
      data: {
        status: MatchStatus.ACTIVE,
        currentRound: 1,
        startedAt,
      },
    });
    expect(result).toMatchObject({
      matchId: 'match-1',
      roundId: 'round-1',
      roundNumber: 1,
      questionId: 'question-1',
      startedAt,
      deadlineAt: new Date(startedAt.getTime() + 20_000),
    });
  });

  it('rejects a match whose participant composition does not match its mode', async () => {
    tx.match.findUnique.mockResolvedValue({
      id: 'match-1',
      mode: MatchMode.ONE_V_AI,
      status: MatchStatus.WAITING,
      currentRound: 0,
      participants: [
        {
          participantType: ParticipantType.HUMAN,
          status: ParticipantStatus.ACTIVE,
        },
        {
          participantType: ParticipantType.HUMAN,
          status: ParticipantStatus.ACTIVE,
        },
      ],
    });

    await expect(
      service.startNextRound('match-1', question),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.question.create).not.toHaveBeenCalled();
  });

  it('rejects matches with extra inactive participants', async () => {
    tx.match.findUnique.mockResolvedValue({
      id: 'match-1',
      mode: MatchMode.ONE_V_AI,
      status: MatchStatus.WAITING,
      currentRound: 0,
      participants: [
        {
          participantType: ParticipantType.HUMAN,
          status: ParticipantStatus.ACTIVE,
        },
        {
          participantType: ParticipantType.AI,
          status: ParticipantStatus.ACTIVE,
        },
        {
          participantType: ParticipantType.HUMAN,
          status: ParticipantStatus.FORFEITED,
        },
      ],
    });

    await expect(
      service.startNextRound('match-1', question),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a match in an invalid lifecycle state before creating a round', async () => {
    tx.match.findUnique.mockResolvedValue({
      id: 'match-1',
      mode: MatchMode.ONE_V_AI,
      status: MatchStatus.READY,
      currentRound: 1,
      participants: [
        {
          participantType: ParticipantType.HUMAN,
          status: ParticipantStatus.ACTIVE,
        },
        {
          participantType: ParticipantType.AI,
          status: ParticipantStatus.ACTIVE,
        },
      ],
    });

    await expect(
      service.startNextRound('match-1', question),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.question.create).not.toHaveBeenCalled();
  });

  it('rejects starting a next round before the previous round is finalized', async () => {
    tx.match.findUnique.mockResolvedValue({
      id: 'match-1',
      mode: MatchMode.ONE_V_AI,
      status: MatchStatus.ACTIVE,
      currentRound: 1,
      startedAt,
      participants: [
        {
          participantType: ParticipantType.HUMAN,
          status: ParticipantStatus.ACTIVE,
        },
        {
          participantType: ParticipantType.AI,
          status: ParticipantStatus.ACTIVE,
        },
      ],
    });
    tx.round.findUnique.mockResolvedValue({ completedAt: null });

    await expect(
      service.startNextRound('match-1', question),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns authoritative round settlement only to a match participant', async () => {
    prisma.round.findFirst.mockResolvedValue({
      id: 'round-1',
      matchId: 'match-1',
      roundNumber: 1,
      startedAt,
      deadlineAt: new Date(startedAt.getTime() + 20_000),
      completedAt: new Date(startedAt.getTime() + 15_000),
      voidedAt: null,
      match: { participants: [
        { id: 'human-row', userId: null, guestIdentityId: 'guest-1', participantType: ParticipantType.HUMAN, status: ParticipantStatus.ACTIVE, score: 15 },
        { id: 'ai-row', userId: null, guestIdentityId: null, participantType: ParticipantType.AI, status: ParticipantStatus.ACTIVE, score: 10 },
      ] },
      answers: [
        { participantId: 'human-row', status: 'ANSWERED', judgeStatus: 'COMPLETED', decision: 'CORRECT', points: 15, elapsedMs: 1200, acceptedAt: startedAt },
        { participantId: 'ai-row', status: 'ANSWERED', judgeStatus: 'COMPLETED', decision: 'INCORRECT', points: 0, elapsedMs: 2200, acceptedAt: startedAt },
      ],
    });
    const result = await service.getRoundResult('match-1', 'round-1', principal);
    expect(result).toMatchObject({
      status: 'COMPLETED',
      participants: [
        { type: ParticipantType.HUMAN, isSelf: true, score: 15, answer: { decision: 'CORRECT', points: 15 } },
        { type: ParticipantType.AI, isSelf: false, score: 10, answer: { decision: 'INCORRECT', points: 0 } },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('human-row');
    expect(JSON.stringify(result)).not.toContain('guest-1');
  });

  it('hides every participant answer and score until the round is finalized', async () => {
    prisma.round.findFirst.mockResolvedValue({
      id: 'round-1',
      matchId: 'match-1',
      roundNumber: 1,
      startedAt,
      deadlineAt: new Date(startedAt.getTime() + 20_000),
      completedAt: null,
      voidedAt: null,
      match: { participants: [
        { id: 'human-row', userId: null, guestIdentityId: 'guest-1', participantType: ParticipantType.HUMAN, status: ParticipantStatus.ACTIVE, score: 50 },
        { id: 'ai-row', userId: null, guestIdentityId: null, participantType: ParticipantType.AI, status: ParticipantStatus.ACTIVE, score: 80 },
      ] },
      answers: [
        { participantId: 'human-row', status: 'ANSWERED', judgeStatus: 'COMPLETED', decision: 'CORRECT', points: 15, elapsedMs: 1200, acceptedAt: startedAt },
        { participantId: 'ai-row', status: 'ANSWERED', judgeStatus: 'PENDING', decision: null, points: 0, elapsedMs: 2200, acceptedAt: startedAt },
      ],
    });
    const result = await service.getRoundResult('match-1', 'round-1', principal);
    expect(result.status).toBe('ACTIVE');
    for (const participant of result.participants) {
      expect(participant).not.toHaveProperty('score');
      expect(participant.answer).toBeNull();
    }
  });

  it('localizes prompt and options while preserving canonical option IDs and order', async () => {
    const deadlineAt = new Date(startedAt.getTime() + 20_000);
    prisma.round.findFirst.mockResolvedValue({
      id: 'round-1',
      matchId: 'match-1',
      roundNumber: 1,
      questionId: 'question-1',
      startedAt,
      deadlineAt,
      question: {
        id: 'question-1',
        answerType: 'MULTIPLE_CHOICE',
        canonicalPrompt: 'Canonical prompt',
        canonicalOptions: [
          { id: 'A', text: 'Canonical A' },
          { id: 'B', text: 'Canonical B' },
        ],
        localized: {
          en: {
            prompt: 'English prompt',
            options: { A: 'English A', B: 'English B' },
          },
          fa: {
            prompt: 'پرسش فارسی',
            options: { A: 'گزینه الف', B: 'گزینه ب' },
          },
        },
        timeLimitSeconds: 20,
      },
    });

    const result = await service.getRoundQuestion(
      'match-1',
      'round-1',
      principal,
      'fa',
    );

    expect(prisma.round.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'round-1',
        matchId: 'match-1',
        match: { participants: { some: { guestIdentityId: 'guest-1' } } },
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
    expect(result.prompt).toBe('پرسش فارسی');
    expect(result.options).toEqual([
      { id: 'A', text: 'گزینه الف' },
      { id: 'B', text: 'گزینه ب' },
    ]);
    expect(result).not.toHaveProperty('answerKey');
    expect(result).not.toHaveProperty('gradingRubric');
  });

  it('falls back to canonical text when the requested language is unavailable', async () => {
    prisma.round.findFirst.mockResolvedValue({
      id: 'round-1',
      matchId: 'match-1',
      roundNumber: 1,
      questionId: 'question-1',
      startedAt,
      deadlineAt: new Date(startedAt.getTime() + 20_000),
      question: {
        id: 'question-1',
        answerType: 'MULTIPLE_CHOICE',
        canonicalPrompt: 'Canonical prompt',
        canonicalOptions: [
          { id: 'A', text: 'Canonical A' },
          { id: 'B', text: 'Canonical B' },
        ],
        localized: {},
        timeLimitSeconds: 20,
      },
    });

    const result = await service.getRoundQuestion(
      'match-1',
      'round-1',
      principal,
      'fr',
    );

    expect(result.prompt).toBe('Canonical prompt');
    expect(result.options[0].text).toBe('Canonical A');
  });

  it('rejects malformed generated multiple-choice options', async () => {
    const malformed = {
      ...question,
      canonicalOptions: [
        { id: 5, text: 'Bad option' },
        { id: 'B', text: 'Option B' },
      ],
    } as unknown as GeneratedQuestion;

    await expect(
      service.startNextRound('match-1', malformed),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.match.findUnique).not.toHaveBeenCalled();
  });

  it('does not return a round to a non-participant', async () => {
    prisma.round.findFirst.mockResolvedValue(null);

    await expect(
      service.getRoundQuestion('match-1', 'round-1', principal, 'en'),
    ).rejects.toThrow('Round not found');
  });
});
