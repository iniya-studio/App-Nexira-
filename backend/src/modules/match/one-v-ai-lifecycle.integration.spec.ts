import { JudgeDecision, PrincipalType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AnswerService } from './answer.service';
import { AnswerJudgeWorker } from './answer-judge.worker';
import {
  AiOpponentAnswer,
  AiOpponentAnswerInput,
} from './ai-opponent-answer.port';
import { AiOpponentAnswerWorker } from './ai-opponent-answer.worker';
import { FreeTextAnswerJudge, FreeTextJudgeResult } from './answer-judge.port';
import { MatchFinalizationWorker } from './match-finalization.worker';
import { MatchService } from './match.service';
import { QuestionGenerator } from './question-generator.port';
import { QuestionGenerationWorker } from './question-generation.worker';
import { GeneratedQuestion } from './question.types';
import { RoundFinalizationWorker } from './round-finalization.worker';
import { RoundService } from './round.service';

describe('Complete 1vAI match lifecycle integration', () => {
  const prisma = new PrismaService();
  const matches = new MatchService(prisma);
  const rounds = new RoundService(prisma);
  const answers = new AnswerService(prisma);
  const roundFinalizer = new RoundFinalizationWorker(prisma);
  const matchFinalizer = new MatchFinalizationWorker(prisma);
  const matchIds: string[] = [];
  const guestIds: string[] = [];
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
        ...jobs
          .map((job) => job.generatedQuestionId)
          .filter((id): id is string => id !== null),
      );
      await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
      matchIds.length = 0;
    }
    if (questionIds.length) {
      await prisma.question.deleteMany({
        where: { id: { in: [...new Set(questionIds)] } },
      });
      questionIds.length = 0;
    }
    if (guestIds.length) {
      await prisma.guestXPTransaction.deleteMany({ where: { guestIdentityId: { in: guestIds } } });
      await prisma.guestIdentity.deleteMany({
        where: { id: { in: guestIds } },
      });
      guestIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const generatedQuestion = (
    input: Parameters<QuestionGenerator['generate']>[0],
    sequence: number,
  ): GeneratedQuestion => {
    const prompt = `1vAI lifecycle round ${sequence}: which planet is known as the Red Planet?`;
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
      contentVersion: `one-v-ai-lifecycle-v1-${sequence}`,
      judgeVersion: 'one-v-ai-lifecycle-judge-v1',
      generatorVersion: 'integration-test-generator',
      modelVersion: 'integration-test-model',
      generationPolicyVersion: 'integration-test-policy',
    };
  };

  const judgeResult = (): FreeTextJudgeResult => ({
    decision: JudgeDecision.CORRECT,
    confidence: 0.99,
    reasonCode: 'MEANING_MATCH',
    rationale: 'Deterministic 1vAI lifecycle integration judgement.',
    provider: 'test-provider',
    model: 'test-model',
    policyVersion: 'test-policy-v1',
  });

  it('generates, readies, answers, judges, scores, advances, and finalizes every 1vAI round', async () => {
    const guest = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(guest.id);
    const principal = {
      principalType: PrincipalType.GUEST,
      principalId: guest.id,
      sessionId: randomUUID(),
    } as const;

    const match = await matches.createAiMatch(principal);
    matchIds.push(match.id);
    expect(match.mode).toBe('ONE_V_AI');
    expect(match.roundsTarget).toBeGreaterThan(0);
    expect(match.participants.map((participant) => participant.type).sort())
      .toEqual(['AI', 'HUMAN']);

    let generationSequence = 0;
    const generator: QuestionGenerator = {
      generate: jest.fn(async (input) =>
        generatedQuestion(input, ++generationSequence),
      ),
    };
    const generationWorker = new QuestionGenerationWorker(prisma, generator);

    const receivedAiInputs: AiOpponentAnswerInput[] = [];
    const opponent: AiOpponentAnswer = {
      generateAnswer: jest.fn(async (input: AiOpponentAnswerInput) => {
        receivedAiInputs.push(input);
        return 'Mars';
      }),
    };
    const aiWorker = new AiOpponentAnswerWorker(prisma, opponent);

    const judge: FreeTextAnswerJudge = {
      judge: jest.fn().mockImplementation(async () => judgeResult()),
    };
    const judgeWorker = new AnswerJudgeWorker(prisma, judge);

    let previousRoundId: string | null = null;
    for (
      let roundNumber = 1;
      roundNumber <= match.roundsTarget;
      roundNumber += 1
    ) {
      await expect(generationWorker.runOnce()).resolves.toBe(true);
      const generationJob = await prisma.questionGenerationJob.findFirstOrThrow({
        where: { matchId: match.id, sourceRoundId: previousRoundId },
      });
      expect(generationJob).toMatchObject({
        status: 'COMPLETED',
        triggerReason: roundNumber === 1 ? 'INITIAL_MATCH' : 'NEXT_ROUND',
      });

      const round = await prisma.round.findFirstOrThrow({
        where: { matchId: match.id, roundNumber },
        include: { question: true, readiness: true },
      });
      questionIds.push(round.questionId!);
      expect(round.question?.answerType).toBe('FREE_TEXT');
      expect(round.question?.canonicalPrompt).toContain(`round ${roundNumber}`);
      expect(round.startedAt).toBeNull();
      expect(round.deadlineAt).toBeNull();
      expect(round.readiness).toHaveLength(2);
      expect(round.readiness.filter((item) => item.isReady)).toHaveLength(1);

      const ready = await rounds.markRoundReady(match.id, round.id, principal);
      expect(ready.allReady).toBe(true);
      expect(ready.startedAt).toBeInstanceOf(Date);
      expect(ready.deadlineAt!.getTime() - ready.startedAt!.getTime())
        .toBe(round.question!.timeLimitSeconds * 1_000);

      const publicQuestion = await rounds.getRoundQuestion(
        match.id,
        round.id,
        principal,
        'en',
      );
      expect(publicQuestion.questionId).toBe(round.questionId);
      expect(publicQuestion.prompt).toBe(round.question!.canonicalPrompt);
      expect(publicQuestion).not.toHaveProperty('answerKey');
      expect(publicQuestion).not.toHaveProperty('gradingRubric');

      await expect(aiWorker.runOnce()).resolves.toBe(true);
      const aiParticipant = await prisma.matchParticipant.findFirstOrThrow({
        where: { matchId: match.id, participantType: 'AI' },
      });
      const aiAnswer = await prisma.answer.findUniqueOrThrow({
        where: {
          roundId_participantId: {
            roundId: round.id,
            participantId: aiParticipant.id,
          },
        },
      });
      expect(aiAnswer).toMatchObject({
        responseText: 'Mars',
        status: 'ANSWERED',
        judgeStatus: 'PENDING',
        points: 0,
      });
      expect(
        await prisma.aiAnswerJob.findUniqueOrThrow({
          where: {
            roundId_participantId: {
              roundId: round.id,
              participantId: aiParticipant.id,
            },
          },
        }),
      ).toMatchObject({ status: 'COMPLETED', attempts: 1 });

      const humanReceipt = await answers.submitAnswer(
        match.id,
        round.id,
        principal,
        'The fourth planet from the Sun is Mars.',
        `one-v-ai-human-answer-${roundNumber}`,
      );
      expect(humanReceipt.status).toBe('ACCEPTED');

      await expect(judgeWorker.runOnce()).resolves.toBe(true);
      await expect(judgeWorker.runOnce()).resolves.toBe(true);
      expect(judge.judge).toHaveBeenCalledTimes(roundNumber * 2);

      const persistedAnswers = await prisma.answer.findMany({
        where: { roundId: round.id },
        include: { participant: { select: { participantType: true } } },
      });
      expect(persistedAnswers).toHaveLength(2);
      expect(
        persistedAnswers.every(
          (answer) =>
            answer.status === 'ANSWERED' &&
            answer.judgeStatus === 'COMPLETED' &&
            answer.decision === 'CORRECT' &&
            answer.points > 0,
        ),
      ).toBe(true);
      expect(
        persistedAnswers.filter(
          (answer) => answer.participant.participantType === 'AI',
        ),
      ).toHaveLength(1);
      expect(
        persistedAnswers.filter(
          (answer) => answer.participant.participantType === 'HUMAN',
        ),
      ).toHaveLength(1);

      expect(
        await prisma.matchScoreEntry.count({
          where: { matchId: match.id, roundId: round.id },
        }),
      ).toBe(2);

      await expect(roundFinalizer.runOnce()).resolves.toBe(true);
      await expect(roundFinalizer.runOnce()).resolves.toBe(false);
      const completedRound = await prisma.round.findUniqueOrThrow({
        where: { id: round.id },
        select: { completedAt: true },
      });
      expect(completedRound.completedAt).toBeInstanceOf(Date);

      const currentMatch = await prisma.match.findUniqueOrThrow({
        where: { id: match.id },
        select: { status: true, currentRound: true },
      });
      expect(currentMatch.currentRound).toBe(roundNumber);
      expect(currentMatch.status).toBe(
        roundNumber < match.roundsTarget ? 'READY' : 'ACTIVE',
      );

      previousRoundId = round.id;
      if (roundNumber < match.roundsTarget) {
        await expect(
          prisma.questionGenerationJob.findUnique({
            where: { sourceRoundId: round.id },
          }),
        ).resolves.toMatchObject({
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

    expect(generator.generate).toHaveBeenCalledTimes(match.roundsTarget);
    expect(opponent.generateAnswer).toHaveBeenCalledTimes(match.roundsTarget);
    expect(receivedAiInputs).toHaveLength(match.roundsTarget);
    for (const input of receivedAiInputs) {
      expect(Object.keys(input).sort()).toEqual([
        'answerType',
        'options',
        'question',
      ]);
      expect(JSON.stringify(input)).not.toContain('answerKey');
      expect(JSON.stringify(input)).not.toContain('gradingRubric');
    }

    const beforeFinalization = await prisma.matchParticipant.findMany({
      where: { matchId: match.id },
      orderBy: { participantType: 'asc' },
      select: { id: true, participantType: true, score: true },
    });
    expect(beforeFinalization).toHaveLength(2);
    expect(beforeFinalization.every((participant) => participant.score > 0))
      .toBe(true);

    await expect(matchFinalizer.runOnce()).resolves.toBe(true);
    await expect(matchFinalizer.runOnce()).resolves.toBe(false);

    const completedMatch = await prisma.match.findUniqueOrThrow({
      where: { id: match.id },
      select: {
        mode: true,
        status: true,
        currentRound: true,
        roundsTarget: true,
        completedAt: true,
      },
    });
    expect(completedMatch).toMatchObject({
      mode: 'ONE_V_AI',
      status: 'COMPLETED',
      currentRound: match.roundsTarget,
      roundsTarget: match.roundsTarget,
    });
    expect(completedMatch.completedAt).toBeInstanceOf(Date);

    const result = await prisma.matchResult.findUniqueOrThrow({
      where: { matchId: match.id },
    });
    expect(result.resultSummary).toMatchObject({
      roundsPlayed: match.roundsTarget,
    });
    expect(
      result.winnerParticipantId === null ||
      beforeFinalization.some(
        (participant) => participant.id === result.winnerParticipantId,
      ),
    ).toBe(true);

    const afterFinalization = await prisma.matchParticipant.findMany({
      where: { matchId: match.id },
      orderBy: { participantType: 'asc' },
      select: { id: true, participantType: true, score: true, status: true },
    });
    expect(afterFinalization).toEqual(
      beforeFinalization.map((participant) => ({
        ...participant,
        status: 'COMPLETED',
      })),
    );
    expect(await prisma.round.count({ where: { matchId: match.id } }))
      .toBe(match.roundsTarget);
    expect(await prisma.matchScoreEntry.count({ where: { matchId: match.id } }))
      .toBe(match.roundsTarget * 2);
  });
});
