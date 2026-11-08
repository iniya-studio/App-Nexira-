import { MatchStatus, PrincipalType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { MatchService } from './match.service';
import {
  QuestionGenerationError,
  QuestionGenerator,
} from './question-generator.port';
import { QuestionGenerationWorker } from './question-generation.worker';
import { GeneratedQuestion } from './question.types';
import { RoundService } from './round.service';
import { RoundTechnicalVoidWorker } from './round-technical-void.worker';

describe('Question generation recovery integration', () => {
  const prisma = new PrismaService();
  const matches = new MatchService(prisma);
  const rounds = new RoundService(prisma);
  const technicalVoid = new RoundTechnicalVoidWorker(prisma);
  const matchIds: string[] = [];
  const guestIds: string[] = [];
  const questionIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (matchIds.length) {
      const generated = await prisma.questionGenerationJob.findMany({
        where: { matchId: { in: matchIds } },
        select: { generatedQuestionId: true },
      });
      questionIds.push(
        ...generated
          .map((job) => job.generatedQuestionId)
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
      await prisma.guestIdentity.deleteMany({
        where: { id: { in: guestIds } },
      });
      guestIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function sourceQuestion(
    prompt = `Source ${randomUUID()}`,
  ): GeneratedQuestion {
    return {
      category: 'science',
      difficulty: 'medium',
      canonicalLanguage: 'en',
      answerType: 'FREE_TEXT',
      canonicalPrompt: prompt,
      canonicalOptions: null,
      answerKey: 'Mars',
      gradingRubric: {
        requiredConcepts: ['Mars'],
        acceptEquivalentWording: true,
      },
      localized: { en: { prompt } },
      timeLimitSeconds: 30,
      contentVersion: `recovery-source-${randomUUID()}`,
    };
  }

  function replacementQuestion(
    input: Parameters<QuestionGenerator['generate']>[0],
    prompt = `Replacement ${randomUUID()}`,
  ): GeneratedQuestion {
    return {
      category: input.category,
      difficulty: input.difficulty,
      canonicalLanguage: input.language,
      answerType: input.answerType,
      canonicalPrompt: prompt,
      canonicalOptions: null,
      answerKey: 'Warm',
      gradingRubric: {
        requiredConcepts: ['Warm'],
        acceptEquivalentWording: true,
      },
      localized: { [input.language]: { prompt } },
      timeLimitSeconds: input.timeLimitSeconds,
      contentVersion: `recovery-generated-${randomUUID()}`,
      generatorVersion: 'test-generator-v1',
      modelVersion: 'test-model-v1',
      generationPolicyVersion: 'test-policy-v1',
    };
  }

  async function createRecovery(
    firstPrincipal?: AuthenticatedPrincipal,
    secondPrincipal?: AuthenticatedPrincipal,
    question = sourceQuestion(),
  ) {
    const firstGuest =
      firstPrincipal?.principalType === PrincipalType.GUEST
        ? null
        : await prisma.guestIdentity.create({ data: {} });
    const secondGuest =
      secondPrincipal?.principalType === PrincipalType.GUEST
        ? null
        : await prisma.guestIdentity.create({ data: {} });
    if (firstGuest) guestIds.push(firstGuest.id);
    if (secondGuest) guestIds.push(secondGuest.id);

    const first = firstPrincipal ?? {
      principalType: PrincipalType.GUEST,
      principalId: firstGuest!.id,
      sessionId: randomUUID(),
    };
    const second = secondPrincipal ?? {
      principalType: PrincipalType.GUEST,
      principalId: secondGuest!.id,
      sessionId: randomUUID(),
    };
    const match = await matches.createOneVsOne(first, second);
    matchIds.push(match.id);
    const started = await rounds.startNextRound(match.id, question);
    questionIds.push(started.questionId);

    const participants = await prisma.matchParticipant.findMany({
      where: { matchId: match.id },
      orderBy: { joinedAt: 'asc' },
      select: { id: true },
    });
    await prisma.answer.create({
      data: {
        matchId: match.id,
        roundId: started.roundId,
        participantId: participants[0].id,
        status: 'ANSWERED',
        judgeStatus: 'COMPLETED',
        decision: 'CORRECT',
        confidence: 1,
        elapsedMs: 1_000,
        points: 25,
        speedBonus: 15,
        responseText: 'Mars',
      },
    });
    await prisma.answer.create({
      data: {
        matchId: match.id,
        roundId: started.roundId,
        participantId: participants[1].id,
        status: 'ANSWERED',
        judgeStatus: 'FAILED',
        judgeAttempts: 3,
        elapsedMs: 1_000,
        points: 0,
        responseText: 'Mars',
      },
    });
    await prisma.matchScoreEntry.create({
      data: {
        matchId: match.id,
        participantId: participants[0].id,
        roundId: started.roundId,
        entryType: 'ANSWER_SCORE',
        pointsChange: 25,
        idempotencyKey: `integration:${match.id}:source-score:v1`,
      },
    });
    await prisma.matchParticipant.update({
      where: { id: participants[0].id },
      data: { score: 25 },
    });

    await expect(technicalVoid.runOnce()).resolves.toBe(true);
    return {
      first,
      second,
      matchId: match.id,
      sourceRoundId: started.roundId,
      sourceQuestion: question,
      sourceQuestionId: started.questionId,
      scoredParticipantId: participants[0].id,
    };
  }

  it('queues once, stores a valid unstarted replacement, waits for all humans, then starts one shared clock', async () => {
    const recovery = await createRecovery();
    await expect(technicalVoid.runOnce()).resolves.toBe(false);
    const job = await prisma.questionGenerationJob.findUniqueOrThrow({
      where: { sourceRoundId: recovery.sourceRoundId },
    });
    expect(job).toMatchObject({
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 3,
      idempotencyKey: `round:${recovery.sourceRoundId}:question-generation:v1`,
      triggerReason: 'AI_JUDGE_RETRY_EXHAUSTED',
    });

    let generatorInput:
      Parameters<QuestionGenerator['generate']>[0] | undefined;
    const generator: QuestionGenerator = {
      generate: jest.fn(async (input) => {
        generatorInput = input;
        return replacementQuestion(input);
      }),
    };
    const worker = new QuestionGenerationWorker(prisma, generator);
    await expect(worker.runOnce()).resolves.toBe(true);
    expect(generatorInput).toMatchObject({
      category: 'science',
      difficulty: 'medium',
      language: 'en',
      answerType: 'FREE_TEXT',
      timeLimitSeconds: 30,
      excludedQuestionIds: [recovery.sourceQuestionId],
    });
    expect(generatorInput).not.toHaveProperty('userId');
    expect(generatorInput).not.toHaveProperty('guestIdentityId');

    const completedJob = await prisma.questionGenerationJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(completedJob).toMatchObject({
      status: 'COMPLETED',
      attempts: 1,
      lastErrorCode: null,
    });
    const replacement = await prisma.round.findFirstOrThrow({
      where: {
        matchId: recovery.matchId,
        roundNumber: 2,
      },
      include: { question: true },
    });
    questionIds.push(replacement.questionId!);
    expect(replacement).toMatchObject({
      startedAt: null,
      deadlineAt: null,
      question: {
        category: 'science',
        difficulty: 'medium',
        answerKey: 'Warm',
        generatorVersion: 'test-generator-v1',
        modelVersion: 'test-model-v1',
        generationPolicyVersion: 'test-policy-v1',
      },
    });
    expect(replacement.question?.contentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      rounds.getQuestionRecovery(recovery.matchId, recovery.first),
    ).resolves.toMatchObject({
      matchStatus: MatchStatus.READY,
      status: 'COMPLETED',
      roundId: replacement.id,
      ready: false,
      allReady: false,
      startedAt: null,
      deadlineAt: null,
    });
    expect(
      await prisma.matchParticipant.findUniqueOrThrow({
        where: { id: recovery.scoredParticipantId },
      }),
    ).toMatchObject({ score: 0 });

    await expect(
      rounds.getRoundQuestion(
        recovery.matchId,
        replacement.id,
        recovery.first,
        'en',
      ),
    ).rejects.toThrow('Round not found');
    const firstReady = await rounds.markRoundReady(
      recovery.matchId,
      replacement.id,
      recovery.first,
    );
    expect(firstReady).toMatchObject({
      ready: true,
      allReady: false,
      startedAt: null,
      deadlineAt: null,
    });
    await expect(
      rounds.getQuestionRecovery(recovery.matchId, recovery.first),
    ).resolves.toMatchObject({ ready: true, allReady: false });
    expect(
      await prisma.match.findUniqueOrThrow({
        where: { id: recovery.matchId },
        select: { currentRound: true },
      }),
    ).toEqual({ currentRound: 1 });

    const simultaneousReady = await Promise.all([
      rounds.markRoundReady(recovery.matchId, replacement.id, recovery.second),
      rounds.markRoundReady(recovery.matchId, replacement.id, recovery.second),
    ]);
    const [secondReady, retriedSecondReady] = simultaneousReady;
    expect(secondReady).toMatchObject({
      ready: true,
      allReady: true,
    });
    expect(secondReady.startedAt).toBeInstanceOf(Date);
    expect(retriedSecondReady.startedAt).toEqual(secondReady.startedAt);
    expect(retriedSecondReady.deadlineAt).toEqual(secondReady.deadlineAt);
    expect(
      secondReady.deadlineAt!.getTime() - secondReady.startedAt!.getTime(),
    ).toBe(30_000);
    const repeatedReady = await rounds.markRoundReady(
      recovery.matchId,
      replacement.id,
      recovery.first,
    );
    expect(repeatedReady.startedAt).toEqual(secondReady.startedAt);
    expect(repeatedReady.deadlineAt).toEqual(secondReady.deadlineAt);
    expect(
      await prisma.round.count({
        where: { matchId: recovery.matchId, roundNumber: 2 },
      }),
    ).toBe(1);
    expect(
      await prisma.match.findUniqueOrThrow({
        where: { id: recovery.matchId },
        select: { status: true, currentRound: true },
      }),
    ).toEqual({ status: MatchStatus.ACTIVE, currentRound: 2 });
  });

  it('backs off exponentially and cancels after three failures without leaving scores or a replacement', async () => {
    const recovery = await createRecovery();
    const generator: QuestionGenerator = {
      generate: jest
        .fn()
        .mockRejectedValue(
          new QuestionGenerationError(
            'GENERATOR_PROVIDER_TIMEOUT',
            'Synthetic timeout',
          ),
        ),
    };
    const worker = new QuestionGenerationWorker(prisma, generator);

    await worker.runOnce();
    let job = await prisma.questionGenerationJob.findUniqueOrThrow({
      where: { sourceRoundId: recovery.sourceRoundId },
    });
    let dbClock = await prisma.$queryRaw<Array<{ now: Date }>>`
      SELECT clock_timestamp() AS "now"
    `;
    expect(job.attempts).toBe(1);
    expect(
      job.availableAt.getTime() - dbClock[0].now.getTime(),
    ).toBeGreaterThan(700);
    expect(job.availableAt.getTime() - dbClock[0].now.getTime()).toBeLessThan(
      1_500,
    );

    await prisma.questionGenerationJob.update({
      where: { id: job.id },
      data: { availableAt: new Date(Date.now() - 10_000) },
    });
    await worker.runOnce();
    job = await prisma.questionGenerationJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    dbClock = await prisma.$queryRaw<Array<{ now: Date }>>`
      SELECT clock_timestamp() AS "now"
    `;
    expect(job.attempts).toBe(2);
    expect(
      job.availableAt.getTime() - dbClock[0].now.getTime(),
    ).toBeGreaterThan(1_700);
    expect(job.availableAt.getTime() - dbClock[0].now.getTime()).toBeLessThan(
      2_700,
    );

    await prisma.questionGenerationJob.update({
      where: { id: job.id },
      data: { availableAt: new Date(Date.now() - 10_000) },
    });
    await worker.runOnce();

    job = await prisma.questionGenerationJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(job).toMatchObject({
      status: 'FAILED',
      attempts: 3,
      lastErrorCode: 'GENERATOR_PROVIDER_TIMEOUT',
    });
    expect(
      await prisma.match.findUniqueOrThrow({
        where: { id: recovery.matchId },
        select: { status: true },
      }),
    ).toEqual({ status: 'CANCELLED' });
    expect(
      await prisma.matchParticipant.findUniqueOrThrow({
        where: { id: recovery.scoredParticipantId },
      }),
    ).toMatchObject({ score: 0 });
    expect(
      await prisma.matchResult.count({
        where: { matchId: recovery.matchId },
      }),
    ).toBe(0);
    expect(
      await prisma.round.count({
        where: { matchId: recovery.matchId },
      }),
    ).toBe(1);
  });

  it('marks the AI participant ready automatically and waits only for the human', async () => {
    const guest = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(guest.id);
    const human: AuthenticatedPrincipal = {
      principalType: PrincipalType.GUEST,
      principalId: guest.id,
      sessionId: randomUUID(),
    };
    const match = await matches.createAiMatch(human);
    matchIds.push(match.id);
    const source = sourceQuestion();
    const started = await rounds.startNextRound(match.id, source);
    questionIds.push(started.questionId);
    const participants = await prisma.matchParticipant.findMany({
      where: { matchId: match.id },
    });
    const humanParticipant = participants.find(
      (participant) => participant.participantType === 'HUMAN',
    )!;
    await prisma.answer.create({
      data: {
        matchId: match.id,
        roundId: started.roundId,
        participantId: humanParticipant.id,
        status: 'ANSWERED',
        judgeStatus: 'FAILED',
        judgeAttempts: 3,
        elapsedMs: 1_000,
        points: 0,
        responseText: 'Mars',
      },
    });
    await expect(technicalVoid.runOnce()).resolves.toBe(true);

    const worker = new QuestionGenerationWorker(prisma, {
      generate: jest.fn(async (input) => replacementQuestion(input)),
    });
    await worker.runOnce();
    const replacement = await prisma.round.findFirstOrThrow({
      where: { matchId: match.id, roundNumber: 2 },
    });
    questionIds.push(replacement.questionId!);
    expect(
      await prisma.roundReadiness.findMany({
        where: { roundId: replacement.id },
        include: { participant: { select: { participantType: true } } },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          isReady: true,
          participant: { participantType: 'AI' },
        }),
        expect.objectContaining({
          isReady: false,
          participant: { participantType: 'HUMAN' },
        }),
      ]),
    );

    const ready = await rounds.markRoundReady(match.id, replacement.id, human);
    expect(ready).toMatchObject({ allReady: true, ready: true });
    expect(ready.startedAt).toBeInstanceOf(Date);
  });

  it('recovers expired leases, rejects concurrent claims, and fences a stale worker result', async () => {
    const recovery = await createRecovery();
    let signalStarted!: () => void;
    let releaseSlow!: (question: GeneratedQuestion) => void;
    const generationStarted = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const slowResult = new Promise<GeneratedQuestion>((resolve) => {
      releaseSlow = resolve;
    });
    const slowGenerator: QuestionGenerator = {
      generate: jest.fn(async () => {
        signalStarted();
        return slowResult;
      }),
    };
    const staleWorker = new QuestionGenerationWorker(prisma, slowGenerator);
    const staleAttempt = staleWorker.runOnce();
    await generationStarted;

    const concurrentGenerator: QuestionGenerator = {
      generate: jest.fn(async (input) =>
        replacementQuestion(input, 'Fresh lease result'),
      ),
    };
    const currentWorker = new QuestionGenerationWorker(
      prisma,
      concurrentGenerator,
    );
    await expect(currentWorker.runOnce()).resolves.toBe(false);
    expect(concurrentGenerator.generate).not.toHaveBeenCalled();

    await prisma.questionGenerationJob.update({
      where: { sourceRoundId: recovery.sourceRoundId },
      data: { leaseAt: new Date(Date.now() - 120_000) },
    });
    await expect(currentWorker.runOnce()).resolves.toBe(true);
    releaseSlow(
      replacementQuestion(
        {
          category: 'science',
          difficulty: 'medium',
          language: 'en',
          answerType: 'FREE_TEXT',
          timeLimitSeconds: 30,
          excludedQuestionIds: [],
          excludedQuestionFingerprints: [],
        },
        'Stale worker result',
      ),
    );
    await staleAttempt;

    const job = await prisma.questionGenerationJob.findUniqueOrThrow({
      where: { sourceRoundId: recovery.sourceRoundId },
    });
    expect(job).toMatchObject({ status: 'COMPLETED', attempts: 2 });
    const createdRounds = await prisma.round.findMany({
      where: { matchId: recovery.matchId, roundNumber: 2 },
      include: { question: true },
    });
    expect(createdRounds).toHaveLength(1);
    questionIds.push(createdRounds[0].questionId!);
    expect(createdRounds[0].question?.canonicalPrompt).toBe(
      'Fresh lease result',
    );
  });

  it('rejects repeated questions in the same match and in an exact-participant rematch', async () => {
    const firstGuest = await prisma.guestIdentity.create({ data: {} });
    const secondGuest = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(firstGuest.id, secondGuest.id);
    const firstPrincipal: AuthenticatedPrincipal = {
      principalType: PrincipalType.GUEST,
      principalId: firstGuest.id,
      sessionId: randomUUID(),
    };
    const secondPrincipal: AuthenticatedPrincipal = {
      principalType: PrincipalType.GUEST,
      principalId: secondGuest.id,
      sessionId: randomUUID(),
    };
    const priorQuestion: GeneratedQuestion = {
      ...sourceQuestion('A question from the prior match'),
      generatorVersion: 'test-generator-v1',
      modelVersion: 'test-model-v1',
      generationPolicyVersion: 'test-policy-v1',
    };
    const prior = await createRecovery(
      firstPrincipal,
      secondPrincipal,
      priorQuestion,
    );
    await prisma.questionGenerationJob.update({
      where: { sourceRoundId: prior.sourceRoundId },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    const rematchSource: GeneratedQuestion = {
      ...sourceQuestion('A distinct rematch source question'),
      generatorVersion: 'test-generator-v1',
      modelVersion: 'test-model-v1',
      generationPolicyVersion: 'test-policy-v1',
    };
    const rematch = await createRecovery(
      firstPrincipal,
      secondPrincipal,
      rematchSource,
    );
    const duplicateGenerator: QuestionGenerator = {
      generate: jest.fn().mockResolvedValue(priorQuestion),
    };
    const worker = new QuestionGenerationWorker(prisma, duplicateGenerator);
    await expect(worker.runOnce()).resolves.toBe(true);

    const job = await prisma.questionGenerationJob.findUniqueOrThrow({
      where: { sourceRoundId: rematch.sourceRoundId },
    });
    expect(job).toMatchObject({
      status: 'PENDING',
      attempts: 1,
      lastErrorCode: 'GENERATOR_DUPLICATE_QUESTION',
    });
    expect(
      await prisma.round.count({
        where: { matchId: rematch.matchId, roundNumber: 2 },
      }),
    ).toBe(0);

    const sameMatchDuplicateWorker = new QuestionGenerationWorker(prisma, {
      generate: jest.fn().mockResolvedValue(rematchSource),
    });
    await prisma.questionGenerationJob.update({
      where: { id: job.id },
      data: { availableAt: new Date(Date.now() - 10_000) },
    });
    await sameMatchDuplicateWorker.runOnce();
    expect(
      await prisma.questionGenerationJob.findUniqueOrThrow({
        where: { id: job.id },
      }),
    ).toMatchObject({
      status: 'PENDING',
      attempts: 2,
      lastErrorCode: 'GENERATOR_DUPLICATE_QUESTION',
    });
    expect(prior.sourceQuestionId).not.toBe(rematch.sourceQuestionId);
  });

  it('prevents unauthorized readiness and refuses to start a cancelled match', async () => {
    const recovery = await createRecovery();
    const worker = new QuestionGenerationWorker(prisma, {
      generate: jest.fn(async (input) => replacementQuestion(input)),
    });
    await worker.runOnce();
    const replacement = await prisma.round.findFirstOrThrow({
      where: { matchId: recovery.matchId, roundNumber: 2 },
    });
    questionIds.push(replacement.questionId!);

    const outsider = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(outsider.id);
    await expect(
      rounds.markRoundReady(recovery.matchId, replacement.id, {
        principalType: PrincipalType.GUEST,
        principalId: outsider.id,
        sessionId: randomUUID(),
      }),
    ).rejects.toThrow('Round not found');
    expect(
      await prisma.roundReadiness.count({
        where: { roundId: replacement.id, isReady: true },
      }),
    ).toBe(0);

    await prisma.match.update({
      where: { id: recovery.matchId },
      data: { status: MatchStatus.CANCELLED, completedAt: new Date() },
    });
    await expect(
      rounds.markRoundReady(recovery.matchId, replacement.id, recovery.first),
    ).rejects.toThrow('Match is not accepting replacement readiness');
    expect(
      await prisma.round.findUniqueOrThrow({
        where: { id: replacement.id },
      }),
    ).toMatchObject({ startedAt: null, deadlineAt: null });
  });

  it('cancels a replacement when human readiness exceeds its bounded wait', async () => {
    const recovery = await createRecovery();
    const generator = new QuestionGenerationWorker(prisma, {
      generate: jest.fn(async (input) => replacementQuestion(input)),
    });
    await generator.runOnce();
    const replacement = await prisma.round.findFirstOrThrow({
      where: { matchId: recovery.matchId, roundNumber: 2 },
    });
    questionIds.push(replacement.questionId!);
    await prisma.round.update({
      where: { id: replacement.id },
      data: { readinessExpiresAt: new Date(Date.now() - 1_000) },
    });

    await expect(generator.runOnce()).resolves.toBe(false);
    expect(
      await prisma.match.findUniqueOrThrow({
        where: { id: recovery.matchId },
        select: { status: true },
      }),
    ).toEqual({ status: MatchStatus.CANCELLED });
    await expect(
      rounds.getQuestionRecovery(recovery.matchId, recovery.first),
    ).resolves.toMatchObject({
      status: 'COMPLETED',
      lastErrorCode: 'READINESS_TIMEOUT',
    });
    expect(
      await prisma.matchParticipant.findUniqueOrThrow({
        where: { id: recovery.scoredParticipantId },
      }),
    ).toMatchObject({ score: 0 });
    expect(
      await prisma.round.findUniqueOrThrow({
        where: { id: replacement.id },
      }),
    ).toMatchObject({ startedAt: null, deadlineAt: null });
  });
});
