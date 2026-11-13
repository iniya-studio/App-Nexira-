import {
  AnswerStatus,
  JudgeStatus,
  ParticipantType,
  PrincipalType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchService } from './match.service';
import { RoundService } from './round.service';
import { AiOpponentAnswer, AiOpponentAnswerInput } from './ai-opponent-answer.port';
import { AiOpponentAnswerWorker } from './ai-opponent-answer.worker';
import { RoundDeadlineWorker } from './round-deadline.worker';
import { GeneratedQuestion } from './question.types';

describe('AI opponent answer worker integration', () => {
  const prisma = new PrismaService();
  const matches = new MatchService(prisma);
  const rounds = new RoundService(prisma);
  const matchIds: string[] = [];
  const guestIds: string[] = [];
  const questionIds: string[] = [];

  const multipleChoiceQuestion: GeneratedQuestion = {
    category: 'science',
    difficulty: 'medium',
    canonicalLanguage: 'en',
    answerType: 'MULTIPLE_CHOICE',
    canonicalPrompt: 'Which planet is known as the Red Planet?',
    canonicalOptions: [
      { id: 'mars', text: 'Mars' },
      { id: 'venus', text: 'Venus' },
      { id: 'jupiter', text: 'Jupiter' },
      { id: 'mercury', text: 'Mercury' },
    ],
    answerKey: 'mars',
    gradingRubric: { requiredConcepts: [], acceptEquivalentWording: true },
    localized: {
      en: {
        prompt: 'Which planet is known as the Red Planet?',
        options: {
          mars: 'Mars',
          venus: 'Venus',
          jupiter: 'Jupiter',
          mercury: 'Mercury',
        },
      },
    },
    timeLimitSeconds: 30,
    contentVersion: 'ai-opponent-integration-v1',
    judgeVersion: 'mcq-exact-v1',
  };

  const freeTextQuestion: GeneratedQuestion = {
    category: 'science',
    difficulty: 'medium',
    canonicalLanguage: 'en',
    answerType: 'FREE_TEXT',
    canonicalPrompt: 'Which planet is known as the Red Planet?',
    canonicalOptions: null,
    answerKey: 'Mars',
    gradingRubric: {
      requiredConcepts: ['Mars'],
      acceptEquivalentWording: true,
    },
    localized: {
      en: { prompt: 'Which planet is known as the Red Planet?' },
    },
    timeLimitSeconds: 30,
    contentVersion: 'ai-opponent-free-text-integration-v1',
    judgeVersion: 'free-text-semantic-v1',
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (matchIds.length) {
      await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
      matchIds.length = 0;
    }
    if (questionIds.length) {
      await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
      questionIds.length = 0;
    }
    if (guestIds.length) {
      await prisma.guestIdentity.deleteMany({ where: { id: { in: guestIds } } });
      guestIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createAiRound(question: GeneratedQuestion) {
    const guest = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(guest.id);
    const match = await matches.createAiMatch({
      principalType: PrincipalType.GUEST,
      principalId: guest.id,
      sessionId: randomUUID(),
    });
    matchIds.push(match.id);

    const started = await rounds.startNextRound(match.id, question);
    questionIds.push(started.questionId);
    const aiParticipant = await prisma.matchParticipant.findFirstOrThrow({
      where: { matchId: match.id, participantType: ParticipantType.AI },
      select: { id: true },
    });
    await prisma.aiAnswerJob.create({
      data: {
        matchId: match.id,
        roundId: started.roundId,
        participantId: aiParticipant.id,
        idempotencyKey: `ai-answer:${started.roundId}:${aiParticipant.id}:v1`,
      },
    });
    return { matchId: match.id, roundId: started.roundId, aiParticipantId: aiParticipant.id };
  }

  it('isolates the provider input and persists exactly one scored MCQ answer across concurrent workers', async () => {
    const { matchId, roundId, aiParticipantId } = await createAiRound(
      multipleChoiceQuestion,
    );
    const receivedInputs: AiOpponentAnswerInput[] = [];
    const opponent: AiOpponentAnswer = {
      generateAnswer: jest.fn(async (input: AiOpponentAnswerInput) => {
        receivedInputs.push(input);
        return 'mars';
      }),
    };
    const workerA = new AiOpponentAnswerWorker(prisma, opponent);
    const workerB = new AiOpponentAnswerWorker(prisma, opponent);

    const results = await Promise.all([workerA.runOnce(), workerB.runOnce()]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(opponent.generateAnswer).toHaveBeenCalledTimes(1);
    expect(receivedInputs).toHaveLength(1);
    expect(Object.keys(receivedInputs[0]).sort()).toEqual([
      'answerType',
      'options',
      'question',
    ]);
    expect(JSON.stringify(receivedInputs[0])).not.toContain('answerKey');
    expect(JSON.stringify(receivedInputs[0])).not.toContain('gradingRubric');

    const answer = await prisma.answer.findUniqueOrThrow({
      where: {
        roundId_participantId: { roundId, participantId: aiParticipantId },
      },
    });
    expect(answer).toMatchObject({
      status: AnswerStatus.ANSWERED,
      judgeStatus: JudgeStatus.COMPLETED,
      decision: 'CORRECT',
      points: 25,
      idempotencyKey: `ai-answer:${roundId}:${aiParticipantId}:v1`,
    });
    expect(
      await prisma.matchScoreEntry.count({ where: { answerId: answer.id } }),
    ).toBe(1);
    const participant = await prisma.matchParticipant.findUniqueOrThrow({
      where: { id: aiParticipantId },
    });
    expect(participant.score).toBe(25);
    expect(
      await prisma.aiAnswerJob.count({
        where: { matchId, roundId, status: 'COMPLETED' },
      }),
    ).toBe(1);
  });

  it('recovers an expired lease and fences out the stale worker response', async () => {
    const { roundId, aiParticipantId } = await createAiRound(
      multipleChoiceQuestion,
    );
    let signalFirstStarted!: () => void;
    let resolveFirst!: (value: string) => void;
    const firstStarted = new Promise<void>((resolve) => {
      signalFirstStarted = resolve;
    });
    const firstResponse = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const opponent: AiOpponentAnswer = {
      generateAnswer: jest
        .fn()
        .mockImplementationOnce(async () => {
          signalFirstStarted();
          return firstResponse;
        })
        .mockResolvedValueOnce('mars'),
    };
    const staleWorker = new AiOpponentAnswerWorker(prisma, opponent);
    const recoveryWorker = new AiOpponentAnswerWorker(prisma, opponent);

    const staleRun = staleWorker.runOnce();
    await firstStarted;
    await prisma.aiAnswerJob.update({
      where: { roundId_participantId: { roundId, participantId: aiParticipantId } },
      data: { leaseAt: new Date(Date.now() - 60_000) },
    });

    await expect(recoveryWorker.runOnce()).resolves.toBe(true);
    resolveFirst('venus');
    await expect(staleRun).resolves.toBe(true);

    const answer = await prisma.answer.findUniqueOrThrow({
      where: {
        roundId_participantId: { roundId, participantId: aiParticipantId },
      },
    });
    expect(answer.responseText).toBe('mars');
    expect(answer.decision).toBe('CORRECT');
    expect(opponent.generateAnswer).toHaveBeenCalledTimes(2);
    expect(
      await prisma.matchScoreEntry.count({ where: { answerId: answer.id } }),
    ).toBe(1);
  });

  it('retries provider failures with a bounded attempt count', async () => {
    const { roundId, aiParticipantId } = await createAiRound(
      multipleChoiceQuestion,
    );
    const opponent: AiOpponentAnswer = {
      generateAnswer: jest.fn().mockRejectedValue(new Error('provider unavailable')),
    };
    const worker = new AiOpponentAnswerWorker(prisma, opponent);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(worker.runOnce()).resolves.toBe(true);
      if (attempt < 2) {
        await prisma.aiAnswerJob.update({
          where: { roundId_participantId: { roundId, participantId: aiParticipantId } },
          data: { availableAt: new Date(Date.now() - 1_000) },
        });
      }
    }

    const job = await prisma.aiAnswerJob.findUniqueOrThrow({
      where: { roundId_participantId: { roundId, participantId: aiParticipantId } },
    });
    expect(job.status).toBe('FAILED');
    expect(job.attempts).toBe(3);
    expect(opponent.generateAnswer).toHaveBeenCalledTimes(3);
    expect(
      await prisma.answer.count({
        where: { roundId, participantId: aiParticipantId },
      }),
    ).toBe(0);
  });

  it('sends free-text AI answers through the existing Judge pipeline', async () => {
    const { roundId, aiParticipantId } = await createAiRound(freeTextQuestion);
    const opponent: AiOpponentAnswer = {
      generateAnswer: jest.fn().mockResolvedValue('Mars'),
    };
    const worker = new AiOpponentAnswerWorker(prisma, opponent);

    await expect(worker.runOnce()).resolves.toBe(true);
    const answer = await prisma.answer.findUniqueOrThrow({
      where: {
        roundId_participantId: { roundId, participantId: aiParticipantId },
      },
    });
    expect(answer.status).toBe(AnswerStatus.ANSWERED);
    expect(answer.judgeStatus).toBe(JudgeStatus.PENDING);
    expect(answer.decision).toBeNull();
    expect(answer.points).toBe(0);
  });

  it('finalizes an overdue 1vAI round and records AI NO_RESPONSE without an AI penalty', async () => {
    const { matchId, roundId, aiParticipantId } = await createAiRound(
      multipleChoiceQuestion,
    );
    await prisma.round.update({
      where: { id: roundId },
      data: { deadlineAt: new Date(Date.now() - 1_000) },
    });
    const deadlineWorker = new RoundDeadlineWorker(prisma);

    await expect(deadlineWorker.runOnce()).resolves.toBe(true);
    const aiAnswer = await prisma.answer.findUniqueOrThrow({
      where: {
        roundId_participantId: { roundId, participantId: aiParticipantId },
      },
    });
    expect(aiAnswer.status).toBe(AnswerStatus.NO_RESPONSE);
    expect(aiAnswer.points).toBe(0);
    expect(
      await prisma.matchScoreEntry.count({
        where: { matchId, participantId: aiParticipantId },
      }),
    ).toBe(0);
    expect(
      await prisma.aiAnswerJob.findFirstOrThrow({ where: { roundId } }),
    ).toMatchObject({ status: 'CANCELLED', lastErrorCode: 'ROUND_DEADLINE' });
  });
});
