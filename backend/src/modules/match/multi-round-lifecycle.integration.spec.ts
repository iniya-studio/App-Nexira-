import { JudgeDecision, PrincipalType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AnswerService } from './answer.service';
import { AnswerJudgeWorker } from './answer-judge.worker';
import { FreeTextAnswerJudge, FreeTextJudgeResult } from './answer-judge.port';
import { MatchFinalizationWorker } from './match-finalization.worker';
import { MatchSettlementService } from './match-settlement.service';
import { MatchService } from './match.service';
import { QuestionGenerator } from './question-generator.port';
import { QuestionGenerationWorker } from './question-generation.worker';
import { GeneratedQuestion } from './question.types';
import { RoundFinalizationWorker } from './round-finalization.worker';
import { RoundService } from './round.service';

describe('Multi-round match lifecycle integration', () => {
  const prisma = new PrismaService();
  const matches = new MatchService(prisma);
  const rounds = new RoundService(prisma);
  const answers = new AnswerService(prisma);
  const roundFinalizer = new RoundFinalizationWorker(prisma);
  const matchFinalizer = new MatchFinalizationWorker(prisma);
  const settlement = new MatchSettlementService();
  const matchIds: string[] = [];
  const guestIds: string[] = [];
  const userIds: string[] = [];
  const questionIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (matchIds.length) {
      const jobs = await prisma.questionGenerationJob.findMany({
        where: { matchId: { in: matchIds } },
        select: { generatedQuestionId: true },
      });
      questionIds.push(
        ...jobs.map((job) => job.generatedQuestionId)
          .filter((id): id is string => id !== null),
      );
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
    if (userIds.length) {
      await prisma.xPTransaction.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.rankingTransaction.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const generatedQuestion = (
    input: Parameters<QuestionGenerator['generate']>[0],
    sequence: number,
  ): GeneratedQuestion => {
    const prompt = `Lifecycle integration question ${sequence}: name the red planet.`;
    return {
      category: input.category,
      difficulty: input.difficulty,
      canonicalLanguage: input.language,
      answerType: input.answerType,
      canonicalPrompt: prompt,
      canonicalOptions: null,
      answerKey: 'Mars',
      gradingRubric: {
        requiredConcepts: ['Mars'],
        acceptEquivalentWording: true,
      },
      localized: { [input.language]: { prompt } },
      timeLimitSeconds: input.timeLimitSeconds,
      contentVersion: `multi-round-lifecycle-v1-${sequence}`,
      generatorVersion: 'integration-test-generator',
      modelVersion: 'integration-test-model',
      generationPolicyVersion: 'integration-test-policy',
    };
  };

  const judgeResult = (): FreeTextJudgeResult => ({
    decision: JudgeDecision.CORRECT,
    confidence: 0.99,
    reasonCode: 'MEANING_MATCH',
    rationale: 'Deterministic integration-test judgement.',
    provider: 'test-provider',
    model: 'test-model',
    policyVersion: 'test-policy-v1',
  });

  it('plays all ten rounds, advances exactly once per round, preserves scores, and finalizes once', async () => {
    const [firstUser, secondUser] = await Promise.all([
      prisma.user.create({
        data: { username: `match-player-${randomUUID()}`, displayName: 'Match Player One' },
      }),
      prisma.user.create({
        data: { username: `match-player-${randomUUID()}`, displayName: 'Match Player Two' },
      }),
    ]);
    userIds.push(firstUser.id, secondUser.id);

    const first = {
      principalType: PrincipalType.USER,
      principalId: firstUser.id,
      sessionId: randomUUID(),
    };
    const second = {
      principalType: PrincipalType.USER,
      principalId: secondUser.id,
      sessionId: randomUUID(),
    };
    const match = await matches.createOneVsOne(first, second);
    matchIds.push(match.id);
    expect(match.roundsTarget).toBe(10);

    let generationSequence = 0;
    const generator: QuestionGenerator = {
      generate: jest.fn(async (input) =>
        generatedQuestion(input, ++generationSequence),
      ),
    };
    const generationWorker = new QuestionGenerationWorker(prisma, generator);
    const judge: FreeTextAnswerJudge = {
      judge: jest.fn().mockImplementation(async () => judgeResult()),
    };
    const judgeWorker = new AnswerJudgeWorker(prisma, judge);

    let previousRoundId: string | null = null;
    for (let roundNumber = 1; roundNumber <= match.roundsTarget; roundNumber += 1) {
      await expect(generationWorker.runOnce()).resolves.toBe(true);
      const job = await prisma.questionGenerationJob.findFirstOrThrow({
        where: {
          matchId: match.id,
          sourceRoundId: previousRoundId,
        },
      });
      expect(job).toMatchObject({
        status: 'COMPLETED',
        triggerReason: roundNumber === 1 ? 'INITIAL_MATCH' : 'NEXT_ROUND',
      });

      const round = await prisma.round.findFirstOrThrow({
        where: { matchId: match.id, roundNumber },
        include: { question: true },
      });
      questionIds.push(round.questionId!);
      expect(round.question?.canonicalPrompt).toContain(
        `question ${roundNumber}`,
      );
      expect(round.startedAt).toBeNull();
      expect(round.deadlineAt).toBeNull();

      const readiness = await Promise.all([
        rounds.markRoundReady(match.id, round.id, first),
        rounds.markRoundReady(match.id, round.id, second),
      ]);
      const started = readiness.find((item) => item.allReady)!;
      expect(started.startedAt).toBeInstanceOf(Date);
      expect(started.deadlineAt!.getTime() - started.startedAt!.getTime())
        .toBe(round.question!.timeLimitSeconds * 1_000);

      const publicQuestions = await Promise.all([
        rounds.getRoundQuestion(match.id, round.id, first, 'en'),
        rounds.getRoundQuestion(match.id, round.id, second, 'en'),
      ]);
      expect(publicQuestions[0]).toEqual(publicQuestions[1]);
      expect(publicQuestions[0].questionId).toBe(round.questionId);

      await Promise.all([
        answers.submitAnswer(match.id, round.id, first, 'Mars', `multi-${roundNumber}-first`),
        answers.submitAnswer(match.id, round.id, second, 'Mars', `multi-${roundNumber}-second`),
      ]);
      await expect(judgeWorker.runOnce()).resolves.toBe(true);
      await expect(judgeWorker.runOnce()).resolves.toBe(true);
      await expect(roundFinalizer.runOnce()).resolves.toBe(true);
      await expect(roundFinalizer.runOnce()).resolves.toBe(false);

      const persistedAnswers = await prisma.answer.findMany({
        where: { roundId: round.id },
      });
      expect(persistedAnswers).toHaveLength(2);
      expect(persistedAnswers.every((answer) =>
        answer.status === 'ANSWERED' && answer.judgeStatus === 'COMPLETED',
      )).toBe(true);

      const currentMatch = await prisma.match.findUniqueOrThrow({
        where: { id: match.id },
        select: { status: true, currentRound: true },
      });
      expect(currentMatch.currentRound).toBe(roundNumber);
      expect(currentMatch.status).toBe(
        roundNumber < match.roundsTarget ? 'READY' : 'ACTIVE',
      );

      const scoreEntries = await prisma.matchScoreEntry.count({
        where: { matchId: match.id, roundId: round.id },
      });
      expect(scoreEntries).toBe(2);
      previousRoundId = round.id;

      if (roundNumber < match.roundsTarget) {
        const nextJob = await prisma.questionGenerationJob.findUnique({
          where: { sourceRoundId: round.id },
        });
        expect(nextJob).toMatchObject({
          status: 'PENDING',
          triggerReason: 'NEXT_ROUND',
          idempotencyKey: `round:${round.id}:next-question:v1`,
        });
      } else {
        await expect(
          prisma.questionGenerationJob.findUnique({
            where: { sourceRoundId: round.id },
          }),
        ).resolves.toBeNull();
      }
    }

    const beforeFinalization = await prisma.matchParticipant.findMany({
      where: { matchId: match.id },
      orderBy: { joinedAt: 'asc' },
      select: { id: true, score: true },
    });
    expect(beforeFinalization.every((participant) => participant.score > 0)).toBe(true);

    await expect(matchFinalizer.runOnce()).resolves.toBe(true);
    await expect(matchFinalizer.runOnce()).resolves.toBe(false);
    await prisma.$transaction((tx) => settlement.settleCompletedMatch(tx, match.id));

    const completed = await prisma.match.findUniqueOrThrow({
      where: { id: match.id },
      select: { status: true, currentRound: true, roundsTarget: true, completedAt: true },
    });
    expect(completed).toMatchObject({
      status: 'COMPLETED',
      currentRound: 10,
      roundsTarget: 10,
    });
    expect(completed.completedAt).toBeInstanceOf(Date);

    const result = await prisma.matchResult.findUniqueOrThrow({
      where: { matchId: match.id },
    });
    expect(result.resultSummary).toMatchObject({ roundsPlayed: 10 });
    expect(
      result.winnerParticipantId === null ||
      beforeFinalization.some((participant) => participant.id === result.winnerParticipantId),
    ).toBe(true);

    const afterFinalization = await prisma.matchParticipant.findMany({
      where: { matchId: match.id },
      orderBy: { joinedAt: 'asc' },
      select: { id: true, score: true, status: true },
    });
    expect(afterFinalization).toEqual(
      beforeFinalization.map((participant) => ({
        ...participant,
        status: 'COMPLETED',
      })),
    );
    expect(await prisma.round.count({ where: { matchId: match.id } })).toBe(10);
    expect(await prisma.matchScoreEntry.count({ where: { matchId: match.id } })).toBe(20);

    const xpEvents = await prisma.xPTransaction.findMany({
      where: { matchId: match.id },
    });
    expect(xpEvents).toHaveLength(2);
    expect(xpEvents.every((event) => event.amount > 0)).toBe(true);
    const progress = await prisma.userProgress.findMany({
      where: { userId: { in: userIds } },
    });
    expect(progress).toHaveLength(2);
    const globalRankings = await prisma.globalUserRanking.findMany({
      where: { userId: { in: userIds } },
    });
    expect(globalRankings).toHaveLength(2);
    expect(globalRankings.every((ranking) => ranking.matchesPlayed === 1)).toBe(true);
    expect(globalRankings.reduce((sum, ranking) => sum + ranking.rankingPoints, 0))
      .toBe(20);
    expect(await prisma.rankingTransaction.count({ where: { matchId: match.id } }))
      .toBe(2);
  });
});
