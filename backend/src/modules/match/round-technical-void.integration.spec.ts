import { JudgeDecision, PrincipalType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AnswerService } from './answer.service';
import {
  FreeTextAnswerJudge,
  FreeTextJudgeError,
  FreeTextJudgeResult,
} from './answer-judge.port';
import { AnswerJudgeWorker } from './answer-judge.worker';
import { MatchService } from './match.service';
import { QuestionGenerator } from './question-generator.port';
import { QuestionGenerationWorker } from './question-generation.worker';
import { GeneratedQuestion } from './question.types';
import { RoundService } from './round.service';
import { RoundTechnicalVoidWorker } from './round-technical-void.worker';
import { RoundDeadlineWorker } from './round-deadline.worker';

describe('Technical round void and recovery integration', () => {
  const prisma = new PrismaService();
  const matches = new MatchService(prisma);
  const rounds = new RoundService(prisma);
  const answers = new AnswerService(prisma);
  const technicalVoid = new RoundTechnicalVoidWorker(prisma);
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
    },
    localized: {
      en: { prompt: 'Which planet is known as the Red Planet?' },
    },
    timeLimitSeconds: 60,
    contentVersion: 'technical-void-test-v1',
    judgeVersion: 'free-text-semantic-v1',
  };

  const replacementQuestion: GeneratedQuestion = {
    ...question,
    category: 'science',
    difficulty: 'medium',
    canonicalPrompt: 'Which planet is the largest in our solar system?',
    answerKey: 'Jupiter',
    gradingRubric: {
      requiredConcepts: ['Jupiter'],
      acceptEquivalentWording: true,
    },
    localized: {
      en: { prompt: 'Which planet is the largest in our solar system?' },
    },
    contentVersion: 'technical-void-replacement-v1',
    generatorVersion: 'test-generator-v1',
    modelVersion: 'test-model-v1',
    generationPolicyVersion: 'test-policy-v1',
  };

  const judgeResult = (): FreeTextJudgeResult => ({
    decision: JudgeDecision.CORRECT,
    confidence: 0.99,
    reasonCode: 'MEANING_MATCH',
    rationale: 'Integration-test judgement.',
    provider: 'test-provider',
    model: 'test-model',
    policyVersion: 'test-policy-v1',
  });

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
      await prisma.guestIdentity.deleteMany({
        where: { id: { in: guestIds } },
      });
      guestIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('voids an exhausted AI-judge round, reverses prior score exactly once, and allows a fresh replacement round', async () => {
    const [firstGuest, secondGuest] = await Promise.all([
      prisma.guestIdentity.create({ data: {} }),
      prisma.guestIdentity.create({ data: {} }),
    ]);
    guestIds.push(firstGuest.id, secondGuest.id);

    const firstPrincipal = {
      principalType: PrincipalType.GUEST,
      principalId: firstGuest.id,
      sessionId: randomUUID(),
    } as const;
    const secondPrincipal = {
      principalType: PrincipalType.GUEST,
      principalId: secondGuest.id,
      sessionId: randomUUID(),
    } as const;

    const match = await matches.createOneVsOne(firstPrincipal, secondPrincipal);
    matchIds.push(match.id);
    const started = await rounds.startNextRound(match.id, question);
    questionIds.push(started.questionId);

    const firstReceipt = await answers.submitAnswer(
      match.id,
      started.roundId,
      firstPrincipal,
      'Mars',
      randomUUID(),
    );
    const successfulJudge: FreeTextAnswerJudge = {
      judge: jest.fn().mockResolvedValue(judgeResult()),
    };
    const successfulWorker = new AnswerJudgeWorker(prisma, successfulJudge);
    await expect(successfulWorker.runOnce()).resolves.toBe(true);

    const secondReceipt = await answers.submitAnswer(
      match.id,
      started.roundId,
      secondPrincipal,
      'Venus',
      randomUUID(),
    );
    const failingJudge: FreeTextAnswerJudge = {
      judge: jest
        .fn()
        .mockRejectedValue(
          new FreeTextJudgeError('PROVIDER_TIMEOUT', 'Test provider timeout'),
        ),
    };
    const failingWorker = new AnswerJudgeWorker(prisma, failingJudge);

    await failingWorker.runOnce();
    await prisma.answer.update({
      where: { id: secondReceipt.answerId },
      data: { judgeAvailableAt: new Date(Date.now() - 1_000) },
    });
    await failingWorker.runOnce();
    await prisma.answer.update({
      where: { id: secondReceipt.answerId },
      data: { judgeAvailableAt: new Date(Date.now() - 1_000) },
    });
    await failingWorker.runOnce();

    const failedAnswer = await prisma.answer.findUniqueOrThrow({
      where: { id: secondReceipt.answerId },
    });
    expect(failedAnswer.judgeStatus).toBe('FAILED');
    expect(failedAnswer.judgeAttempts).toBe(3);

    const scoredParticipant = await prisma.matchParticipant.findFirstOrThrow({
      where: { matchId: match.id, guestIdentityId: firstGuest.id },
    });
    const originalScore = await prisma.matchScoreEntry.findFirstOrThrow({
      where: { answerId: firstReceipt.answerId, entryType: 'ANSWER_SCORE' },
    });
    expect(scoredParticipant.score).toBe(originalScore.pointsChange);
    expect(originalScore.pointsChange).toBeGreaterThan(0);

    await expect(technicalVoid.runOnce()).resolves.toBe(true);

    const voidedRound = await prisma.round.findUniqueOrThrow({
      where: { id: started.roundId },
    });
    expect(voidedRound.voidedAt).toBeInstanceOf(Date);
    expect(voidedRound.completedAt).toEqual(voidedRound.voidedAt);
    expect(voidedRound.voidReason).toBe('AI_JUDGE_RETRY_EXHAUSTED');
    expect(
      await prisma.match.findUniqueOrThrow({
        where: { id: match.id },
        select: { status: true },
      }),
    ).toEqual({ status: 'READY' });
    expect(
      await prisma.questionGenerationJob.count({
        where: { sourceRoundId: started.roundId },
      }),
    ).toBe(1);

    const reversal = await prisma.matchScoreEntry.findFirstOrThrow({
      where: {
        roundId: started.roundId,
        entryType: 'ROUND_VOID_REVERSAL',
      },
    });
    expect(reversal).toMatchObject({
      participantId: scoredParticipant.id,
      pointsChange: -originalScore.pointsChange,
      idempotencyKey: `round:${started.roundId}:void:reverse:${originalScore.id}:v1`,
    });

    const restoredParticipant = await prisma.matchParticipant.findUniqueOrThrow(
      {
        where: { id: scoredParticipant.id },
      },
    );
    expect(restoredParticipant.score).toBe(0);
    expect(
      await prisma.matchScoreEntry.count({
        where: { roundId: started.roundId, entryType: 'ROUND_VOID_REVERSAL' },
      }),
    ).toBe(1);

    await expect(
      Promise.all([technicalVoid.runOnce(), technicalVoid.runOnce()]),
    ).resolves.toEqual([false, false]);
    expect(
      await prisma.matchScoreEntry.count({
        where: { roundId: started.roundId, entryType: 'ROUND_VOID_REVERSAL' },
      }),
    ).toBe(1);

    await expect(
      rounds.getRoundQuestion(match.id, started.roundId, firstPrincipal, 'en'),
    ).rejects.toThrow('Round not found');
    await expect(
      answers.submitAnswer(
        match.id,
        started.roundId,
        firstPrincipal,
        'Mars',
        randomUUID(),
      ),
    ).rejects.toThrow('Round is not accepting answers');
    await expect(
      rounds.startNextRound(match.id, replacementQuestion),
    ).rejects.toThrow(
      'Technical void replacements must use the question recovery workflow',
    );

    const generator: QuestionGenerator = {
      generate: jest.fn().mockResolvedValue(replacementQuestion),
    };
    const generationWorker = new QuestionGenerationWorker(prisma, generator);
    await expect(generationWorker.runOnce()).resolves.toBe(true);

    const replacementRound = await prisma.round.findFirstOrThrow({
      where: { matchId: match.id, roundNumber: started.roundNumber + 1 },
    });
    questionIds.push(replacementRound.questionId!);
    expect(replacementRound.questionId).not.toBe(started.questionId);
    expect(replacementRound.startedAt).toBeNull();
    expect(replacementRound.deadlineAt).toBeNull();
    expect(
      await prisma.roundReadiness.count({
        where: { roundId: replacementRound.id, isReady: true },
      }),
    ).toBe(0);

    const firstReady = await rounds.markRoundReady(
      match.id,
      replacementRound.id,
      firstPrincipal,
    );
    expect(firstReady.allReady).toBe(false);
    expect(firstReady.startedAt).toBeNull();
    expect(
      await prisma.round.findUniqueOrThrow({
        where: { id: replacementRound.id },
      }),
    ).toMatchObject({ startedAt: null, deadlineAt: null });
    const secondReady = await rounds.markRoundReady(
      match.id,
      replacementRound.id,
      secondPrincipal,
    );
    expect(secondReady.allReady).toBe(true);
    expect(secondReady.startedAt).toBeInstanceOf(Date);
    expect(
      secondReady.deadlineAt!.getTime() - secondReady.startedAt!.getTime(),
    ).toBe(replacementQuestion.timeLimitSeconds * 1000);

    expect(
      await prisma.match.findUniqueOrThrow({
        where: { id: match.id },
        select: { currentRound: true },
      }),
    ).toEqual({ currentRound: replacementRound.roundNumber });
  });

  it('does not void a round while another submitted answer is still pending', async () => {
    const [firstGuest, secondGuest] = await Promise.all([
      prisma.guestIdentity.create({ data: {} }),
      prisma.guestIdentity.create({ data: {} }),
    ]);
    guestIds.push(firstGuest.id, secondGuest.id);

    const firstPrincipal = {
      principalType: PrincipalType.GUEST,
      principalId: firstGuest.id,
      sessionId: randomUUID(),
    } as const;
    const secondPrincipal = {
      principalType: PrincipalType.GUEST,
      principalId: secondGuest.id,
      sessionId: randomUUID(),
    } as const;

    const match = await matches.createOneVsOne(firstPrincipal, secondPrincipal);
    matchIds.push(match.id);
    const started = await rounds.startNextRound(match.id, question);
    questionIds.push(started.questionId);

    await answers.submitAnswer(
      match.id,
      started.roundId,
      firstPrincipal,
      'Mars',
      randomUUID(),
    );
    await answers.submitAnswer(
      match.id,
      started.roundId,
      secondPrincipal,
      'Mars',
      randomUUID(),
    );

    const firstParticipant = await prisma.matchParticipant.findFirstOrThrow({
      where: { matchId: match.id, guestIdentityId: firstGuest.id },
      select: { id: true },
    });
    const secondParticipant = await prisma.matchParticipant.findFirstOrThrow({
      where: { matchId: match.id, guestIdentityId: secondGuest.id },
      select: { id: true },
    });
    await prisma.answer.update({
      where: {
        roundId_participantId: {
          roundId: started.roundId,
          participantId: firstParticipant.id,
        },
      },
      data: { judgeStatus: 'FAILED', judgeAttempts: 3 },
    });
    await prisma.answer.update({
      where: {
        roundId_participantId: {
          roundId: started.roundId,
          participantId: secondParticipant.id,
        },
      },
      data: { judgeStatus: 'PENDING', judgeAttempts: 1 },
    });

    await expect(technicalVoid.runOnce()).resolves.toBe(false);
    const round = await prisma.round.findUniqueOrThrow({
      where: { id: started.roundId },
    });
    expect(round.voidedAt).toBeNull();
  });

  it('leaves an expired round with a terminal AI-judge failure for technical-void recovery', async () => {
    const guest = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(guest.id);
    const principal = {
      principalType: PrincipalType.GUEST,
      principalId: guest.id,
      sessionId: randomUUID(),
    } as const;

    const match = await matches.createAiMatch(principal);
    matchIds.push(match.id);
    const started = await rounds.startNextRound(match.id, question);
    questionIds.push(started.questionId);

    const receipt = await answers.submitAnswer(
      match.id,
      started.roundId,
      principal,
      'Mars',
      randomUUID(),
    );
    const failingJudge: FreeTextAnswerJudge = {
      judge: jest.fn().mockRejectedValue(
        new FreeTextJudgeError('PROVIDER_TIMEOUT', 'Test provider timeout'),
      ),
    };
    const judgeWorker = new AnswerJudgeWorker(prisma, failingJudge);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(judgeWorker.runOnce()).resolves.toBe(true);
      if (attempt < 2) {
        await prisma.answer.update({
          where: { id: receipt.answerId },
          data: { judgeAvailableAt: new Date(Date.now() - 1_000) },
        });
      }
    }

    await expect(
      prisma.answer.findUniqueOrThrow({ where: { id: receipt.answerId } }),
    ).resolves.toMatchObject({ judgeStatus: 'FAILED', judgeAttempts: 3 });

    await prisma.round.update({
      where: { id: started.roundId },
      data: { deadlineAt: new Date(Date.now() - 1_000) },
    });

    const deadlineWorker = new RoundDeadlineWorker(prisma);
    await expect(deadlineWorker.runOnce()).resolves.toBe(false);
    await expect(
      prisma.round.findUniqueOrThrow({ where: { id: started.roundId } }),
    ).resolves.toMatchObject({ completedAt: null, voidedAt: null });

    await expect(technicalVoid.runOnce()).resolves.toBe(true);
    await expect(
      prisma.round.findUniqueOrThrow({ where: { id: started.roundId } }),
    ).resolves.toMatchObject({
      voidReason: 'AI_JUDGE_RETRY_EXHAUSTED',
      completedAt: expect.any(Date),
      voidedAt: expect.any(Date),
    });
    await expect(
      prisma.match.findUniqueOrThrow({
        where: { id: match.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'READY' });
    await expect(
      prisma.answer.count({
        where: { roundId: started.roundId, status: 'NO_RESPONSE' },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.matchScoreEntry.count({
        where: { roundId: started.roundId },
      }),
    ).resolves.toBe(0);
  });

});
