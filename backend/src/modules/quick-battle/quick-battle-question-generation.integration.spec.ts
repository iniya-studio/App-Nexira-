import { JudgeDecision, PrincipalType, QuickBattleStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { QuestionGenerationError, QuestionGenerator } from '../match/question-generator.port';
import { GeneratedQuestion } from '../match/question.types';
import { QuickBattleQuestionGenerationWorker } from './quick-battle-question-generation.worker';
import { QuickBattleRoundPublicationWorker } from './quick-battle-round-publication.worker';
import { QuickBattleAnswerJudgeWorker } from './quick-battle-answer-judge.worker';
import { QuickBattleRoundFinalizationWorker } from './quick-battle-round-finalization.worker';
import { FreeTextAnswerJudge, FreeTextJudgeResult, FreeTextJudgeError } from '../match/answer-judge.port';
import { QuickBattleService } from './quick-battle.service';
import { QuickBattleResultFinalizationWorker } from './quick-battle-result-finalization.worker';

describe('Quick Battle question generation PostgreSQL integration', () => {
  const prisma = new PrismaService();
  const service = new QuickBattleService(prisma);
  const matchIds: string[] = [];
  const guestIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (matchIds.length > 0) {
      const [jobs, rounds] = await Promise.all([
        prisma.quickBattleQuestionJob.findMany({
          where: { matchId: { in: matchIds } },
          select: { generatedQuestionId: true },
        }),
        prisma.quickBattleRound.findMany({
          where: { matchId: { in: matchIds } },
          select: { questionId: true },
        }),
      ]);
      const questionIds = [...new Set([
        ...jobs.map((job) => job.generatedQuestionId),
        ...rounds.map((round) => round.questionId),
      ].filter((id): id is string => id !== null))];
      await prisma.quickBattleMatch.deleteMany({
        where: { id: { in: matchIds } },
      });
      if (questionIds.length > 0) {
        await prisma.question.deleteMany({
          where: { id: { in: questionIds } },
        });
      }
      matchIds.length = 0;
    }
    if (guestIds.length > 0) {
      await prisma.guestIdentity.deleteMany({
        where: { id: { in: guestIds } },
      });
      guestIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createGuestMatch() {
    const guest = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(guest.id);
    const principal: AuthenticatedPrincipal = {
      principalType: PrincipalType.GUEST,
      principalId: guest.id,
      sessionId: randomUUID(),
    };
    const match = await service.createOrRecover(principal, 'en');
    matchIds.push(match.id);
    return { guest, principal, match };
  }

  function generatedQuestion(
    input: Parameters<QuestionGenerator['generate']>[0],
    prompt = `Quick Battle question ${randomUUID()}`,
  ): GeneratedQuestion {
    return {
      category: input.category,
      difficulty: input.difficulty,
      canonicalLanguage: input.language,
      answerType: input.answerType,
      canonicalPrompt: prompt,
      canonicalOptions: null,
      answerKey: 'Mercury',
      gradingRubric: {
        requiredConcepts: ['Mercury'],
        acceptEquivalentWording: true,
      },
      localized: {
        [input.language]: {
          prompt, expectedAnswer: 'Mercury',
          gradingRubric: {
            requiredConcepts: ['Mercury'],
            acceptEquivalentWording: true,
            notes: 'Accept semantically equivalent wording.',
          },
        },
      },
      timeLimitSeconds: input.timeLimitSeconds,
      contentVersion: `quick-battle-test-${randomUUID()}`,
      generatorVersion: 'quick-battle-test-generator-v1',
      modelVersion: 'quick-battle-test-model-v1',
      generationPolicyVersion: 'quick-battle-test-policy-v1',
    };
  }

  async function firstThreeJobs(matchId: string) {
    return prisma.quickBattleQuestionJob.findMany({
      where: { matchId, round: { roundNumber: { lte: 3 } } },
      orderBy: { round: { roundNumber: 'asc' } },
    });
  }

  it('completes the full ten-round lifecycle without creating competitive points', async () => {
    const { match } = await createGuestMatch();
    const generator: QuestionGenerator = {
      generate: jest.fn(async (input) => generatedQuestion(input)),
    };
    const generationWorker = new QuickBattleQuestionGenerationWorker(prisma, generator);
    for (let index = 0; index < 10; index += 1) await generationWorker.runOnce();

    const publisher = new QuickBattleRoundPublicationWorker(prisma);
    const finalizer = new QuickBattleRoundFinalizationWorker(prisma);
    for (let roundNumber = 1; roundNumber <= 10; roundNumber += 1) {
      await expect(publisher.runOnce(match.id)).resolves.toBe(true);
      const round = await prisma.quickBattleRound.findUniqueOrThrow({
        where: { matchId_roundNumber: { matchId: match.id, roundNumber } },
        select: { id: true, startedAt: true, deadlineAt: true },
      });
      expect(round.startedAt).toBeInstanceOf(Date);
      expect(round.deadlineAt).toBeInstanceOf(Date);
      await prisma.quickBattleRound.update({
        where: { id: round.id },
        data: { deadlineAt: new Date(Date.now() - 1_000) },
      });
      await expect(finalizer.runOnce(match.id)).resolves.toBe(true);
    }

    const [completedMatch, rounds, answers] = await Promise.all([
      prisma.quickBattleMatch.findUniqueOrThrow({
        where: { id: match.id },
        select: { status: true, currentRound: true, completedAt: true },
      }),
      prisma.quickBattleRound.findMany({
        where: { matchId: match.id },
        select: { completedAt: true },
      }),
      prisma.quickBattleAnswer.findMany({
        where: { matchId: match.id },
        select: { status: true, points: true },
      }),
    ]);
    expect(completedMatch).toMatchObject({ status: 'COMPLETED', currentRound: 10 });
    expect(completedMatch.completedAt).toBeInstanceOf(Date);
    expect(rounds).toHaveLength(10);
    expect(rounds.every((round) => round.completedAt instanceof Date)).toBe(true);
    expect(answers).toHaveLength(10);
    expect(answers.every((answer) => answer.status === 'NO_RESPONSE' && answer.points === null)).toBe(true);
    await expect(publisher.runOnce(match.id)).resolves.toBe(false);
    await expect(finalizer.runOnce(match.id)).resolves.toBe(false);
  });

  it('serializes concurrent answers and the deadline boundary on PostgreSQL', async () => {
    const { match, principal } = await createGuestMatch();
    const generator: QuestionGenerator = { generate: jest.fn(async (input) => generatedQuestion(input)) };
    const generationWorker = new QuickBattleQuestionGenerationWorker(prisma, generator);
    for (let index = 0; index < 10; index += 1) await generationWorker.runOnce();
    const publisher = new QuickBattleRoundPublicationWorker(prisma);
    const published = await Promise.all([publisher.runOnce(match.id), publisher.runOnce(match.id)]);
    expect(published.filter(Boolean)).toHaveLength(1);

    const submissions = await Promise.allSettled([
      service.submitAnswer(match.id, 1, principal, 'Mercury', 'quick-battle-race-001'),
      service.submitAnswer(match.id, 1, principal, 'Mercury', 'quick-battle-race-002'),
    ]);
    expect(submissions.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(submissions.filter((item) => item.status === 'rejected')).toHaveLength(1);
    expect(await prisma.quickBattleAnswer.count({ where: { matchId: match.id } })).toBe(1);

    const { match: expiredMatch, principal: expiredPrincipal } = await createGuestMatch();
    const expiredGenerator: QuestionGenerator = { generate: jest.fn(async (input) => generatedQuestion(input)) };
    const expiredGenerationWorker = new QuickBattleQuestionGenerationWorker(prisma, expiredGenerator);
    for (let index = 0; index < 10; index += 1) await expiredGenerationWorker.runOnce();
    await new QuickBattleRoundPublicationWorker(prisma).runOnce(expiredMatch.id);
    await prisma.quickBattleRound.updateMany({
      where: { matchId: expiredMatch.id, roundNumber: 1 },
      data: { deadlineAt: new Date(Date.now() - 1_000) },
    });
    const finalizer = new QuickBattleRoundFinalizationWorker(prisma);
    const race = await Promise.allSettled([
      service.submitAnswer(expiredMatch.id, 1, expiredPrincipal, 'Mercury', 'quick-battle-deadline-race'),
      finalizer.runOnce(expiredMatch.id),
    ]);
    expect(race[0].status).toBe('rejected');
    expect(race[1].status).toBe('fulfilled');
    const finalized = race[1].status === 'fulfilled' && race[1].value
      ? true
      : await finalizer.runOnce(expiredMatch.id);
    expect(finalized).toBe(true);
    const outcome = await prisma.quickBattleAnswer.findFirstOrThrow({
      where: { matchId: expiredMatch.id },
    });
    expect(outcome.status).toBe('NO_RESPONSE');
  });

  it('finalizes a judged round early and records an explicit timeout without player penalties', async () => {
    const { match, principal } = await createGuestMatch();
    const generator: QuestionGenerator = { generate: jest.fn(async (input) => generatedQuestion(input)) };
    const generationWorker = new QuickBattleQuestionGenerationWorker(prisma, generator);
    for (let index = 0; index < 10; index += 1) await generationWorker.runOnce();
    const publisher = new QuickBattleRoundPublicationWorker(prisma);
    await publisher.runOnce(match.id);
    const round = await prisma.quickBattleRound.findUniqueOrThrow({
      where: { matchId_roundNumber: { matchId: match.id, roundNumber: 1 } },
      select: { id: true },
    });
    const receipt = await service.submitAnswer(match.id, 1, principal, 'Mercury', 'quick-battle-finalize-001');
    const judge: FreeTextAnswerJudge = {
      judge: jest.fn(async () => ({
        decision: JudgeDecision.CORRECT, confidence: 1, reasonCode: 'MEANING_MATCH',
        rationale: 'Correct', provider: 'test', model: 'test', policyVersion: 'test-v1',
      })),
    };
    await new QuickBattleAnswerJudgeWorker(prisma, judge).runOnce(match.id);
    const finalizer = new QuickBattleRoundFinalizationWorker(prisma);
    await expect(finalizer.runOnce(match.id)).resolves.toBe(true);
    const completedRound = await prisma.quickBattleRound.findUniqueOrThrow({
      where: { id: round.id }, select: { completedAt: true },
    });
    expect(completedRound.completedAt).toBeInstanceOf(Date);
    const answer = await prisma.quickBattleAnswer.findUniqueOrThrow({ where: { id: receipt.answerId } });
    expect(answer.points).toBeNull();

    const { match: timeoutMatch } = await createGuestMatch();
    const timeoutGenerator: QuestionGenerator = { generate: jest.fn(async (input) => generatedQuestion(input)) };
    const timeoutGenerationWorker = new QuickBattleQuestionGenerationWorker(prisma, timeoutGenerator);
    for (let index = 0; index < 10; index += 1) await timeoutGenerationWorker.runOnce();
    await new QuickBattleRoundPublicationWorker(prisma).runOnce(timeoutMatch.id);
    await prisma.quickBattleRound.updateMany({
      where: { matchId: timeoutMatch.id, roundNumber: 1 },
      data: { deadlineAt: new Date(Date.now() - 1_000) },
    });
    await expect(finalizer.runOnce(timeoutMatch.id)).resolves.toBe(true);
    const timeoutAnswer = await prisma.quickBattleAnswer.findFirstOrThrow({
      where: { matchId: timeoutMatch.id },
    });
    expect(timeoutAnswer).toMatchObject({
      status: 'NO_RESPONSE', judgeStatus: 'NOT_REQUIRED', points: null, responseText: null,
    });
    const timeoutRound = await prisma.quickBattleRound.findUniqueOrThrow({
      where: { matchId_roundNumber: { matchId: timeoutMatch.id, roundNumber: 1 } },
      select: { completedAt: true },
    });
    expect(timeoutRound.completedAt).toBeInstanceOf(Date);
  });

  it('judges a submitted answer through the dedicated Quick Battle worker without scoring', async () => {
    const { match, principal } = await createGuestMatch();
    const generator: QuestionGenerator = { generate: jest.fn(async (input) => generatedQuestion(input)) };
    const generationWorker = new QuickBattleQuestionGenerationWorker(prisma, generator);
    await generationWorker.runOnce(); await generationWorker.runOnce(); await generationWorker.runOnce();
    await new QuickBattleRoundPublicationWorker(prisma).runOnce(match.id);
    const receipt = await service.submitAnswer(match.id, 1, principal, 'Mercury', 'quick-battle-judge-001');
    const judgeResult: FreeTextJudgeResult = {
      decision: JudgeDecision.CORRECT, confidence: 0.99, reasonCode: 'MEANING_MATCH',
      rationale: 'The response matches the expected answer.',
      provider: 'test', model: 'deterministic-test', policyVersion: 'test-v1',
    };
    const judge: FreeTextAnswerJudge = { judge: jest.fn(async () => judgeResult) };
    const worker = new QuickBattleAnswerJudgeWorker(prisma, judge);
    await expect(worker.runOnce(match.id)).resolves.toBe(true);
    const answer = await prisma.quickBattleAnswer.findUniqueOrThrow({ where: { id: receipt.answerId } });
    expect(judge.judge).toHaveBeenCalledWith(expect.objectContaining({
      language: 'en', expectedAnswer: 'Mercury', participantResponse: 'Mercury',
    }));
    expect(answer).toMatchObject({
      judgeStatus: 'COMPLETED', decision: 'CORRECT', points: null,
      judgeVersion: 'test:deterministic-test:test-v1',
    });
  });

  it('voids the Quick Battle match after exhausted AI Judge provider failures', async () => {
    const { match, principal } = await createGuestMatch();
    const generator: QuestionGenerator = { generate: jest.fn(async (input) => generatedQuestion(input)) };
    const generationWorker = new QuickBattleQuestionGenerationWorker(prisma, generator);
    await generationWorker.runOnce(); await generationWorker.runOnce(); await generationWorker.runOnce();
    await new QuickBattleRoundPublicationWorker(prisma).runOnce(match.id);
    await service.submitAnswer(match.id, 1, principal, 'Mercury', 'quick-battle-judge-002');
    const judge: FreeTextAnswerJudge = {
      judge: jest.fn().mockRejectedValue(new FreeTextJudgeError('JUDGE_PROVIDER_TIMEOUT', 'Synthetic timeout')),
    };
    const worker = new QuickBattleAnswerJudgeWorker(prisma, judge);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (attempt > 1) await prisma.quickBattleAnswer.updateMany({
        where: { matchId: match.id }, data: { judgeAvailableAt: new Date(Date.now() - 10_000) },
      });
      await expect(worker.runOnce(match.id)).resolves.toBe(true);
    }
    const [answer, updatedMatch] = await Promise.all([
      prisma.quickBattleAnswer.findFirstOrThrow({ where: { matchId: match.id } }),
      prisma.quickBattleMatch.findUniqueOrThrow({
        where: { id: match.id }, select: { status: true, voidReason: true },
      }),
    ]);
    expect(answer).toMatchObject({
      judgeStatus: 'FAILED', judgeAttempts: 3, lastErrorCode: 'JUDGE_PROVIDER_TIMEOUT',
    });
    expect(updatedMatch).toEqual({ status: QuickBattleStatus.VOIDED, voidReason: 'JUDGE_RETRY_EXHAUSTED' });
  });

  it('publishes the first generated round once and accepts one immutable answer', async () => {
    const { match, principal } = await createGuestMatch();
    const generator: QuestionGenerator = { generate: jest.fn(async (input) => generatedQuestion(input)) };
    const generationWorker = new QuickBattleQuestionGenerationWorker(prisma, generator);
    for (let index = 0; index < 10; index += 1) await generationWorker.runOnce();

    const publisher = new QuickBattleRoundPublicationWorker(prisma);
    await expect(publisher.runOnce(match.id)).resolves.toBe(true);
    const round = await prisma.quickBattleRound.findUniqueOrThrow({
      where: { matchId_roundNumber: { matchId: match.id, roundNumber: 1 } },
      select: { id: true, startedAt: true, deadlineAt: true },
    });
    expect(round.startedAt).toBeInstanceOf(Date);
    expect(round.deadlineAt!.getTime() - round.startedAt!.getTime()).toBe(30_000);
    const current = await service.getCurrentRound(match.id, principal);
    expect(current).toMatchObject({
      state: 'ACTIVE', currentRound: 1,
      round: { id: round.id, question: { prompt: expect.stringContaining('Quick Battle question') } },
    });
    const reconnected = await service.getCurrentRound(match.id, principal);
    expect(reconnected.round?.startedAt).toEqual(current.round?.startedAt);
    expect(reconnected.round?.deadlineAt).toEqual(current.round?.deadlineAt);
    expect(reconnected.serverNow).toBeInstanceOf(Date);

    const receipt = await service.submitAnswer(match.id, 1, principal, 'Mercury', 'quick-battle-answer-001');
    expect(receipt).toMatchObject({ status: 'ACCEPTED', replayed: false, roundId: round.id });
    const replay = await service.submitAnswer(match.id, 1, principal, 'Mercury', 'quick-battle-answer-001');
    expect(replay).toMatchObject({ answerId: receipt.answerId, replayed: true });
    await expect(service.submitAnswer(match.id, 1, principal, 'Different answer', 'quick-battle-answer-002'))
      .rejects.toThrow('An answer has already been submitted');
    await expect(publisher.runOnce(match.id)).resolves.toBe(false);

    const persisted = await prisma.quickBattleAnswer.findUniqueOrThrow({ where: { roundId: round.id } });
    expect(persisted).toMatchObject({
      responseText: 'Mercury', status: 'ANSWERED', judgeStatus: 'PENDING', points: null,
    });
  });

  it('makes a match READY only after three valid questions have been persisted', async () => {
    const { match } = await createGuestMatch();
    const generator: QuestionGenerator = {
      generate: jest.fn(async (input) => generatedQuestion(input)),
    };
    const worker = new QuickBattleQuestionGenerationWorker(prisma, generator);

    await expect(worker.runOnce()).resolves.toBe(true);
    await expect(worker.runOnce()).resolves.toBe(true);
    let state = await prisma.quickBattleMatch.findUniqueOrThrow({
      where: { id: match.id },
      select: { status: true },
    });
    expect(state.status).toBe(QuickBattleStatus.PREPARING);

    await expect(worker.runOnce()).resolves.toBe(true);
    state = await prisma.quickBattleMatch.findUniqueOrThrow({
      where: { id: match.id },
      select: { status: true },
    });
    expect(state.status).toBe(QuickBattleStatus.READY);

    const [rounds, jobs] = await Promise.all([
      prisma.quickBattleRound.findMany({
        where: { matchId: match.id, roundNumber: { lte: 3 } },
      }),
      firstThreeJobs(match.id),
    ]);
    expect(rounds).toHaveLength(3);
    expect(rounds.every((round) => round.questionId !== null)).toBe(true);
    expect(jobs).toHaveLength(3);
    expect(jobs.every((job) => job.status === 'COMPLETED')).toBe(true);

    const remaining = await prisma.quickBattleQuestionJob.count({
      where: { matchId: match.id, status: 'PENDING' },
    });
    expect(remaining).toBe(7);
    expect(generator.generate).toHaveBeenCalledTimes(3);
  });

  it('retries provider failures with backoff and technically voids after the final attempt', async () => {
    const { match } = await createGuestMatch();
    const jobs = await firstThreeJobs(match.id);
    const target = jobs[0];
    await prisma.quickBattleQuestionJob.updateMany({
      where: { id: { in: jobs.slice(1).map((job) => job.id) } },
      data: { availableAt: new Date(Date.now() + 60_000) },
    });
    const generator: QuestionGenerator = {
      generate: jest.fn().mockRejectedValue(
        new QuestionGenerationError('GENERATOR_PROVIDER_TIMEOUT', 'Synthetic timeout'),
      ),
    };
    const worker = new QuickBattleQuestionGenerationWorker(prisma, generator);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expect(worker.runOnce()).resolves.toBe(true);
      if (attempt < 3) {
        await prisma.quickBattleQuestionJob.update({
          where: { id: target.id },
          data: { availableAt: new Date(Date.now() - 10_000) },
        });
      }
    }

    const [job, updatedMatch] = await Promise.all([
      prisma.quickBattleQuestionJob.findUniqueOrThrow({ where: { id: target.id } }),
      prisma.quickBattleMatch.findUniqueOrThrow({
        where: { id: match.id },
        select: { status: true, voidReason: true },
      }),
    ]);
    expect(job).toMatchObject({
      status: 'FAILED',
      attempts: 3,
      lastErrorCode: 'GENERATOR_PROVIDER_TIMEOUT',
    });
    expect(updatedMatch).toEqual({
      status: QuickBattleStatus.VOIDED,
      voidReason: 'QUESTION_GENERATION_EXHAUSTED',
    });
    expect(generator.generate).toHaveBeenCalledTimes(3);
  });

  it('rejects invalid localization and never persists the question', async () => {
    const { match } = await createGuestMatch();
    const jobs = await firstThreeJobs(match.id);
    await prisma.quickBattleQuestionJob.updateMany({
      where: { id: { in: jobs.slice(1).map((job) => job.id) } },
      data: { availableAt: new Date(Date.now() + 60_000) },
    });
    const generator: QuestionGenerator = {
      generate: jest.fn(async (input) => ({
        ...generatedQuestion(input),
        localized: { fr: { prompt: 'Une question' } },
      })),
    };
    const worker = new QuickBattleQuestionGenerationWorker(prisma, generator);

    await expect(worker.runOnce()).resolves.toBe(true);

    const [job, questionCount] = await Promise.all([
      prisma.quickBattleQuestionJob.findUniqueOrThrow({ where: { id: jobs[0].id } }),
      prisma.question.count({
        where: { quickBattleGeneratedBy: { is: { matchId: match.id } } },
      }),
    ]);
    expect(job).toMatchObject({
      status: 'PENDING',
      attempts: 1,
      lastErrorCode: 'QUESTION_LOCALIZATION_INVALID',
    });
    expect(questionCount).toBe(0);
  });

  it('recovers an expired lease, fences the stale worker, and persists only the fresh result', async () => {
    const { match } = await createGuestMatch();
    const jobs = await firstThreeJobs(match.id);
    const target = jobs[0];
    await prisma.quickBattleQuestionJob.updateMany({
      where: { id: { in: jobs.slice(1).map((job) => job.id) } },
      data: { availableAt: new Date(Date.now() + 60_000) },
    });

    let signalStarted!: () => void;
    let releaseSlow!: (question: GeneratedQuestion) => void;
    const generationStarted = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const slowResult = new Promise<GeneratedQuestion>((resolve) => {
      releaseSlow = resolve;
    });
    let staleInput: Parameters<QuestionGenerator['generate']>[0] | undefined;
    const staleGenerator: QuestionGenerator = {
      generate: jest.fn(async (input) => {
        staleInput = input;
        signalStarted();
        return slowResult;
      }),
    };
    const staleWorker = new QuickBattleQuestionGenerationWorker(prisma, staleGenerator);
    const staleAttempt = staleWorker.runOnce();
    await generationStarted;

    const freshGenerator: QuestionGenerator = {
      generate: jest.fn(async (input) => generatedQuestion(input, 'Fresh lease wins')),
    };
    const freshWorker = new QuickBattleQuestionGenerationWorker(prisma, freshGenerator);
    await expect(freshWorker.runOnce()).resolves.toBe(false);

    await prisma.quickBattleQuestionJob.update({
      where: { id: target.id },
      data: { leaseAt: new Date(Date.now() - 120_000) },
    });
    await expect(freshWorker.runOnce()).resolves.toBe(true);

    releaseSlow(generatedQuestion(staleInput!, 'Stale worker must not win'));
    await staleAttempt;

    const [job, round, questionCount] = await Promise.all([
      prisma.quickBattleQuestionJob.findUniqueOrThrow({ where: { id: target.id } }),
      prisma.quickBattleRound.findUniqueOrThrow({ where: { id: target.roundId } }),
      prisma.question.count({
        where: { quickBattleGeneratedBy: { is: { matchId: match.id } } },
      }),
    ]);
    expect(job).toMatchObject({ status: 'COMPLETED', attempts: 2 });
    expect(round.questionId).toBe(job.generatedQuestionId);
    expect(questionCount).toBe(1);
    const persisted = await prisma.question.findUniqueOrThrow({
      where: { id: job.generatedQuestionId! },
    });
    expect(persisted.canonicalPrompt).toBe('Fresh lease wins');
    expect(staleGenerator.generate).toHaveBeenCalledTimes(1);
    expect(freshGenerator.generate).toHaveBeenCalledTimes(1);
  });


  it('continues background generation after the first-three readiness gate opens', async () => {
    const { match } = await createGuestMatch();
    const generator: QuestionGenerator = {
      generate: jest.fn(async (input) => generatedQuestion(input)),
    };
    const worker = new QuickBattleQuestionGenerationWorker(prisma, generator);

    for (let index = 0; index < 3; index += 1) {
      await expect(worker.runOnce()).resolves.toBe(true);
    }
    await expect(
      prisma.quickBattleMatch.findUniqueOrThrow({
        where: { id: match.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: QuickBattleStatus.READY });

    await expect(worker.runOnce()).resolves.toBe(true);

    expect(
      await prisma.quickBattleRound.count({
        where: {
          matchId: match.id,
          roundNumber: { gt: 3 },
          questionId: { not: null },
        },
      }),
    ).toBe(1);
    expect(generator.generate).toHaveBeenCalledTimes(4);
  });

  it('rejects a repeated question fingerprint within the same Quick Battle match', async () => {
    const { match } = await createGuestMatch();
    const repeatedPrompt = 'Which planet is known as the Red Planet?';
    const firstWorker = new QuickBattleQuestionGenerationWorker(prisma, {
      generate: jest.fn(async (input) => generatedQuestion(input, repeatedPrompt)),
    });
    await expect(firstWorker.runOnce()).resolves.toBe(true);

    const firstRound = await prisma.quickBattleRound.findFirstOrThrow({
      where: { matchId: match.id, questionId: { not: null } },
      orderBy: { roundNumber: 'asc' },
    });
    const secondWorker = new QuickBattleQuestionGenerationWorker(prisma, {
      generate: jest.fn(async (input) => generatedQuestion(input, repeatedPrompt)),
    });
    await expect(secondWorker.runOnce()).resolves.toBe(true);

    const [retryJob, questionCount] = await Promise.all([
      prisma.quickBattleQuestionJob.findFirstOrThrow({
        where: {
          matchId: match.id,
          status: 'PENDING',
          lastErrorCode: 'GENERATOR_DUPLICATE_QUESTION',
          round: { roundNumber: { gt: firstRound.roundNumber, lte: 3 } },
        },
      }),
      prisma.question.count({
        where: { quickBattleGeneratedBy: { is: { matchId: match.id } } },
      }),
    ]);
    expect(retryJob).toMatchObject({
      attempts: 1,
      lastErrorCode: 'GENERATOR_DUPLICATE_QUESTION',
    });
    expect(questionCount).toBe(1);
    expect(
      await prisma.quickBattleRound.count({
        where: {
          matchId: match.id,
          roundNumber: { gt: firstRound.roundNumber, lte: 3 },
          questionId: { not: null },
        },
      }),
    ).toBe(0);
  });

  it('voids a match when the final processing lease expires without a worker result', async () => {
    const { match } = await createGuestMatch();
    const jobs = await firstThreeJobs(match.id);
    const target = jobs[0];
    await prisma.quickBattleQuestionJob.update({
      where: { id: target.id },
      data: {
        status: 'PROCESSING',
        attempts: 3,
        maxAttempts: 3,
        leaseId: randomUUID(),
        leaseAt: new Date(Date.now() - 120_000),
      },
    });
    await prisma.quickBattleQuestionJob.updateMany({
      where: { id: { in: jobs.slice(1).map((job) => job.id) } },
      data: { availableAt: new Date(Date.now() + 60_000) },
    });
    const generator: QuestionGenerator = {
      generate: jest.fn(async (input) => generatedQuestion(input)),
    };
    const worker = new QuickBattleQuestionGenerationWorker(prisma, generator);

    await expect(worker.runOnce()).resolves.toBe(false);

    const [job, updatedMatch] = await Promise.all([
      prisma.quickBattleQuestionJob.findUniqueOrThrow({ where: { id: target.id } }),
      prisma.quickBattleMatch.findUniqueOrThrow({
        where: { id: match.id },
        select: { status: true, voidReason: true },
      }),
    ]);
    expect(job).toMatchObject({
      status: 'FAILED',
      attempts: 3,
      leaseId: null,
      leaseAt: null,
      lastErrorCode: 'GENERATOR_LEASE_EXPIRED',
    });
    expect(updatedMatch).toEqual({
      status: QuickBattleStatus.VOIDED,
      voidReason: 'QUESTION_GENERATION_EXHAUSTED',
    });
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it('excludes the same guest’s recently served Quick Battle questions from the next match', async () => {
    const { guest, principal, match: firstMatch } = await createGuestMatch();
    const firstGenerator: QuestionGenerator = {
      generate: jest.fn(async (input) => generatedQuestion(input, 'Previously served prompt')),
    };
    const firstWorker = new QuickBattleQuestionGenerationWorker(prisma, firstGenerator);
    await expect(firstWorker.runOnce()).resolves.toBe(true);

    const firstJob = await prisma.quickBattleQuestionJob.findFirstOrThrow({
      where: { matchId: firstMatch.id, status: 'COMPLETED' },
      include: { generatedQuestion: true },
    });
    const firstRound = await prisma.quickBattleRound.findUniqueOrThrow({
      where: { id: firstJob.roundId },
    });
    await prisma.quickBattleRound.update({
      where: { id: firstRound.id },
      data: { startedAt: new Date() },
    });
    await prisma.quickBattleMatch.update({
      where: { id: firstMatch.id },
      data: {
        status: QuickBattleStatus.VOIDED,
        voidedAt: new Date(),
        voidReason: 'TEST_COMPLETED_HISTORY',
      },
    });

    const secondMatch = await service.createOrRecover(principal, 'en');
    matchIds.push(secondMatch.id);
    let capturedInput: Parameters<QuestionGenerator['generate']>[0] | undefined;
    const secondGenerator: QuestionGenerator = {
      generate: jest.fn(async (input) => {
        capturedInput = input;
        return generatedQuestion(input, 'A new prompt for the next match');
      }),
    };
    const secondWorker = new QuickBattleQuestionGenerationWorker(prisma, secondGenerator);
    await expect(secondWorker.runOnce()).resolves.toBe(true);

    expect(capturedInput?.excludedQuestionIds).toContain(firstJob.generatedQuestionId);
    expect(capturedInput?.excludedQuestionFingerprints).toContain(
      firstJob.generatedQuestion?.contentFingerprint,
    );
    expect(capturedInput?.excludedQuestionPrompts).toContain('Previously served prompt');
    expect(guest.id).toBe(principal.principalId);
  });
  it('finalizes the approved ten-round score and persists one immutable result', async () => {
    const { match, principal } = await createGuestMatch();
    const generator: QuestionGenerator = {
      generate: jest.fn(async (input) => generatedQuestion(input)),
    };
    const generationWorker = new QuickBattleQuestionGenerationWorker(prisma, generator);
    for (let index = 0; index < 10; index += 1) await generationWorker.runOnce();

    const publisher = new QuickBattleRoundPublicationWorker(prisma);
    const roundFinalizer = new QuickBattleRoundFinalizationWorker(prisma);
    const judge: FreeTextAnswerJudge = {
      judge: jest.fn(async (input) => ({
        decision: input.participantResponse === 'Mercury' ? JudgeDecision.CORRECT : JudgeDecision.INCORRECT,
        confidence: 1,
        reasonCode: input.participantResponse === 'Mercury' ? 'MEANING_MATCH' : 'NO_MATCH',
        rationale: 'Deterministic integration-test judgment.',
        provider: 'test',
        model: 'quick-battle-result-test',
        policyVersion: 'test-v1',
      })),
    };
    const judgeWorker = new QuickBattleAnswerJudgeWorker(prisma, judge);

    for (let roundNumber = 1; roundNumber <= 10; roundNumber += 1) {
      await expect(publisher.runOnce(match.id)).resolves.toBe(true);
      if (roundNumber <= 7) {
        const response = roundNumber <= 4 ? 'Mercury' : 'Venus';
        const receipt = await service.submitAnswer(
          match.id, roundNumber, principal, response, `quick-battle-score-${roundNumber}-001`,
        );
        await expect(judgeWorker.runOnce(match.id)).resolves.toBe(true);
        if (roundNumber <= 4) {
          await prisma.quickBattleAnswer.update({
            where: { id: receipt.answerId },
            data: { elapsedMs: 15000 },
          });
        }
      } else {
        await prisma.quickBattleRound.updateMany({
          where: { matchId: match.id, roundNumber },
          data: { deadlineAt: new Date(Date.now() - 1000) },
        });
      }
      await expect(roundFinalizer.runOnce(match.id)).resolves.toBe(true);
    }

    const resultWorker = new QuickBattleResultFinalizationWorker(prisma);
    const concurrentFinalizations = await Promise.all([
      resultWorker.runOnce(match.id),
      resultWorker.runOnce(match.id),
    ]);
    expect(concurrentFinalizations).toContain(true);
    await expect(resultWorker.runOnce(match.id)).resolves.toBe(false);
    const result = await prisma.quickBattleResult.findUniqueOrThrow({ where: { matchId: match.id } });
    expect(result).toMatchObject({
      scoringPolicyVersion: 'quick-battle-score-v1',
      totalPoints: 500,
      correctAnswers: 4,
      incorrectAnswers: 3,
      noResponseCount: 3,
    });
    const scoredAnswers = await prisma.quickBattleAnswer.findMany({
      where: { matchId: match.id },
      select: { id: true, points: true },
    });
    expect(scoredAnswers).toHaveLength(10);
    expect(scoredAnswers.filter((answer) => answer.points === 125)).toHaveLength(4);
    expect(scoredAnswers.filter((answer) => answer.points === 0)).toHaveLength(6);
    expect(await prisma.quickBattleResult.count({ where: { matchId: match.id } })).toBe(1);
    await expect(prisma.quickBattleResult.update({
      where: { matchId: match.id },
      data: { totalPoints: 501 },
    })).rejects.toThrow('Quick Battle finalized results are immutable');
    await expect(prisma.quickBattleResult.delete({
      where: { matchId: match.id },
    })).rejects.toThrow('Quick Battle finalized results are immutable');
    await expect(prisma.quickBattleAnswer.update({
      where: { id: scoredAnswers[0].id },
      data: { points: 1 },
    })).rejects.toThrow('Quick Battle finalized answer scores are immutable');
  });

});
