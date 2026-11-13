import { Prisma, PrincipalType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchService } from './match.service';
import { RoundService } from './round.service';
import { RoundDeadlineWorker } from './round-deadline.worker';
import { RoundTechnicalVoidWorker } from './round-technical-void.worker';
import { GeneratedQuestion } from './question.types';

describe('1vAI technical recovery for AI opponent failures', () => {
  const prisma = new PrismaService();
  const matches = new MatchService(prisma);
  const rounds = new RoundService(prisma);
  const deadlineWorker = new RoundDeadlineWorker(prisma);
  const technicalVoidWorker = new RoundTechnicalVoidWorker(prisma);
  const matchIds: string[] = [];
  const guestIds: string[] = [];
  const questionIds: string[] = [];

  const question: GeneratedQuestion = {
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
      notes: 'Accept Mars and equivalent wording.',
    },
    localized: { en: { prompt: 'Which planet is known as the Red Planet?' } },
    timeLimitSeconds: 30,
    contentVersion: 'ai-opponent-technical-recovery-v1',
    judgeVersion: 'free-text-semantic-v1',
    generatorVersion: 'integration-test-generator',
    modelVersion: 'integration-test-model',
    generationPolicyVersion: 'integration-test-policy',
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
      await prisma.guestXPTransaction.deleteMany({ where: { guestIdentityId: { in: guestIds } } });
      await prisma.guestIdentity.deleteMany({ where: { id: { in: guestIds } } });
      guestIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createGuestPrincipal() {
    const guest = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(guest.id);
    return {
      principalType: PrincipalType.GUEST,
      principalId: guest.id,
      sessionId: randomUUID(),
    } as const;
  }

  async function createFailedAiAnswerJob(matchId: string, roundId: string) {
    const aiParticipant = await prisma.matchParticipant.findFirstOrThrow({
      where: { matchId, participantType: 'AI' },
      select: { id: true },
    });
    await prisma.aiAnswerJob.create({
      data: {
        matchId,
        roundId,
        participantId: aiParticipant.id,
        status: 'FAILED',
        attempts: 3,
        maxAttempts: 3,
        completedAt: new Date(),
        lastErrorCode: 'AI_OPPONENT_PROVIDER_TIMEOUT',
        idempotencyKey: `ai-answer:${roundId}:${aiParticipant.id}:v1`,
      },
    });
  }

  it('voids a failed AI opponent round instead of awarding a technical win at the deadline', async () => {
    const principal = await createGuestPrincipal();
    const match = await matches.createAiMatch(principal);
    matchIds.push(match.id);

    const started = await rounds.startNextRound(match.id, question);
    questionIds.push(started.questionId);
    await createFailedAiAnswerJob(match.id, started.roundId);
    await prisma.round.update({
      where: { id: started.roundId },
      data: { deadlineAt: new Date(Date.now() - 1_000) },
    });

    // The deadline worker must leave failed AI jobs to the technical recovery worker.
    await expect(deadlineWorker.runOnce()).resolves.toBe(false);
    await expect(technicalVoidWorker.runOnce()).resolves.toBe(true);

    const voidedRound = await prisma.round.findUniqueOrThrow({
      where: { id: started.roundId },
    });
    expect(voidedRound.voidReason).toBe('AI_OPPONENT_RETRY_EXHAUSTED');
    expect(voidedRound.voidedAt).toBeInstanceOf(Date);
    expect(voidedRound.completedAt).toEqual(voidedRound.voidedAt);
    await expect(
      prisma.match.findUniqueOrThrow({
        where: { id: match.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'READY' });
    await expect(
      prisma.questionGenerationJob.findUnique({
        where: { sourceRoundId: started.roundId },
        select: { status: true, triggerReason: true },
      }),
    ).resolves.toEqual({
      status: 'PENDING',
      triggerReason: 'AI_OPPONENT_RETRY_EXHAUSTED',
    });
  });

  it('cancels cleanly after the configured technical replacement limit', async () => {
    const principal = await createGuestPrincipal();
    const match = await matches.createAiMatch(principal);
    matchIds.push(match.id);

    const now = new Date();
    await prisma.round.createMany({
      data: [1, 2].map((roundNumber) => ({
        matchId: match.id,
        roundNumber,
        completedAt: now,
        voidedAt: now,
        voidReason: 'PREVIOUS_TECHNICAL_FAILURE',
      })),
    });

    const currentQuestion = await prisma.question.create({
      data: {
        category: question.category,
        difficulty: question.difficulty,
        canonicalLanguage: question.canonicalLanguage,
        answerType: question.answerType,
        canonicalPrompt: question.canonicalPrompt,
        canonicalOptions: Prisma.DbNull,
        answerKey: question.answerKey,
        gradingRubric: question.gradingRubric,
        localized: question.localized,
        timeLimitSeconds: question.timeLimitSeconds,
        contentVersion: question.contentVersion,
        judgeVersion: question.judgeVersion,
        generatorVersion: question.generatorVersion,
        modelVersion: question.modelVersion,
        generationPolicyVersion: question.generationPolicyVersion,
      },
    });
    questionIds.push(currentQuestion.id);

    await prisma.match.update({
      where: { id: match.id },
      data: { status: 'ACTIVE', currentRound: 3 },
    });
    const currentRound = await prisma.round.create({
      data: {
        matchId: match.id,
        roundNumber: 3,
        questionId: currentQuestion.id,
        startedAt: now,
        deadlineAt: new Date(now.getTime() + 30_000),
      },
    });
    await createFailedAiAnswerJob(match.id, currentRound.id);

    await expect(technicalVoidWorker.runOnce()).resolves.toBe(true);

    const cancelled = await prisma.match.findUniqueOrThrow({
      where: { id: match.id },
      select: { status: true, completedAt: true },
    });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.completedAt).toBeInstanceOf(Date);

    const recovery = await rounds.getQuestionRecovery(match.id, principal);
    expect(recovery.status).toBe('FAILED');
    expect(recovery.lastErrorCode).toBe('TECHNICAL_VOID_LIMIT');
    expect(
      await prisma.questionGenerationJob.count({
        where: { sourceRoundId: currentRound.id, status: 'PENDING' },
      }),
    ).toBe(0);
  });
});
