import { JudgeDecision, PrincipalType } from '@prisma/client';
import { TARGET_LOCALES } from '../../common/localization/locale-registry';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AnswerService } from './answer.service';
import { AnswerJudgeWorker } from './answer-judge.worker';
import { MatchService } from './match.service';
import { FreeTextAnswerJudge, FreeTextJudgeResult } from './answer-judge.port';
import { GeneratedQuestion } from './question.types';
import { RoundService } from './round.service';

describe('Free-text AI Judge worker integration', () => {
  const prisma = new PrismaService();
  const matches = new MatchService(prisma);
  const rounds = new RoundService(prisma);
  const answers = new AnswerService(prisma);
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
    localized: Object.fromEntries(Object.keys(TARGET_LOCALES).map((locale) => {
      const expectedAnswer = locale === 'en' ? 'Mars' : locale === 'fa' ? 'مریخ' : `Answer:${locale}`;
      const prompt = locale === 'en'
        ? 'Which planet is known as the Red Planet?'
        : locale === 'fa'
          ? 'کدام سیاره به سیاره سرخ معروف است؟'
          : `Question:${locale}`;
      return [locale, {
        prompt,
        expectedAnswer,
        gradingRubric: {
          requiredConcepts: [expectedAnswer],
          acceptEquivalentWording: true,
          notes: `Accept the correct answer in ${locale}.`,
        },
      }];
    })),
    timeLimitSeconds: 30,
    contentVersion: 'free-text-judge-integration-v1',
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

  async function createPendingAnswer(responseText: string, language = 'en') {
    const guest = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(guest.id);
    const match = await matches.createAiMatch({
      principalType: PrincipalType.GUEST,
      principalId: guest.id,
      sessionId: randomUUID(),
    }, { language });
    matchIds.push(match.id);

    const started = await rounds.startNextRound(match.id, question);
    questionIds.push(started.questionId);
    const principal = {
      principalType: PrincipalType.GUEST,
      principalId: guest.id,
      sessionId: randomUUID(),
    } as const;
    const receipt = await answers.submitAnswer(
      match.id,
      started.roundId,
      principal,
      responseText,
      randomUUID(),
    );
    return { matchId: match.id, guestId: guest.id, answerId: receipt.answerId };
  }

  const judgeResult = (
    decision: JudgeDecision,
    confidence = 0.98,
  ): FreeTextJudgeResult => ({
    decision,
    confidence,
    reasonCode:
      decision === JudgeDecision.CORRECT
        ? 'MEANING_MATCH'
        : decision === JudgeDecision.INCORRECT
          ? 'MEANING_MISMATCH'
          : 'AMBIGUOUS',
    rationale: 'Integration-test judgement.',
    provider: 'test-provider',
    model: 'test-model',
    policyVersion: 'test-policy-v1',
  });

  it('claims, judges, scores, and completes a free-text answer exactly once', async () => {
    const { matchId, guestId, answerId } = await createPendingAnswer(
      'The fourth planet from the Sun is Mars.',
    );
    const judge: FreeTextAnswerJudge = {
      judge: jest.fn().mockResolvedValue(judgeResult(JudgeDecision.CORRECT)),
    };
    const worker = new AnswerJudgeWorker(prisma, judge);

    await expect(worker.runOnce()).resolves.toBe(true);

    const persisted = await prisma.answer.findUniqueOrThrow({
      where: { id: answerId },
    });
    expect(persisted.judgeStatus).toBe('COMPLETED');
    expect(persisted.decision).toBe('CORRECT');
    expect(persisted.judgeAttempts).toBe(1);
    expect(persisted.judgeLeaseId).toBeNull();
    expect(persisted.points).toBeGreaterThanOrEqual(12);
    expect(persisted.points).toBeLessThanOrEqual(25);
    expect(persisted.judgeVersion).toBe(
      'test-provider:test-model:test-policy-v1',
    );

    const participant = await prisma.matchParticipant.findFirstOrThrow({
      where: { matchId, guestIdentityId: guestId },
    });
    expect(participant.score).toBe(persisted.points);
    const ledgerEntries = await prisma.matchScoreEntry.findMany({
      where: { answerId },
    });
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0]).toMatchObject({
      entryType: 'ANSWER_SCORE',
      pointsChange: persisted.points,
      idempotencyKey: `answer:${answerId}:score:v1`,
    });

    await expect(worker.runOnce()).resolves.toBe(false);
    const unchanged = await prisma.matchParticipant.findFirstOrThrow({
      where: { matchId, guestIdentityId: guestId },
    });
    expect(unchanged.score).toBe(persisted.points);
    await expect(
      prisma.matchScoreEntry.count({ where: { answerId } }),
    ).resolves.toBe(1);
    expect(judge.judge).toHaveBeenCalledTimes(1);
  });

  it('judges a free-text answer using the immutable Persian participant rendering', async () => {
    const { answerId } = await createPendingAnswer('مریخ', 'fa');
    const judge: FreeTextAnswerJudge = {
      judge: jest.fn().mockResolvedValue(judgeResult(JudgeDecision.CORRECT)),
    };
    const worker = new AnswerJudgeWorker(prisma, judge);

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(judge.judge).toHaveBeenCalledWith(expect.objectContaining({
      canonicalQuestion: 'کدام سیاره به سیاره سرخ معروف است؟',
      language: 'fa',
      expectedAnswer: 'مریخ',
      gradingRubric: expect.objectContaining({ requiredConcepts: ['مریخ'] }),
      participantResponse: 'مریخ',
    }));
    await expect(prisma.answer.findUniqueOrThrow({ where: { id: answerId } }))
      .resolves.toMatchObject({ judgeStatus: 'COMPLETED', decision: 'CORRECT' });
  });

  it('routes AI Judge inputs through all 20 immutable participant locale snapshots', async () => {
    const judge: FreeTextAnswerJudge = {
      judge: jest.fn().mockResolvedValue(judgeResult(JudgeDecision.CORRECT)),
    };
    const worker = new AnswerJudgeWorker(prisma, judge);

    for (const locale of Object.keys(TARGET_LOCALES)) {
      const response = `response:${locale}`;
      const { matchId, guestId, answerId } = await createPendingAnswer(response, 'en');
      await prisma.matchParticipant.updateMany({
        where: { matchId, guestIdentityId: guestId },
        data: { language: locale },
      });

      await expect(worker.runOnce(matchId)).resolves.toBe(true);
      const call = (judge.judge as jest.Mock).mock.calls.at(-1)?.[0];
      const expectedAnswer = locale === 'en' ? 'Mars' : locale === 'fa' ? 'مریخ' : `Answer:${locale}`;
      const expectedPrompt = locale === 'en'
        ? 'Which planet is known as the Red Planet?'
        : locale === 'fa'
          ? 'کدام سیاره به سیاره سرخ معروف است؟'
          : `Question:${locale}`;
      expect(call).toMatchObject({
        canonicalQuestion: expectedPrompt,
        language: locale,
        expectedAnswer,
        gradingRubric: expect.objectContaining({ requiredConcepts: [expectedAnswer] }),
        participantResponse: response,
      });
      await expect(prisma.answer.findUniqueOrThrow({ where: { id: answerId } }))
        .resolves.toMatchObject({ judgeStatus: 'COMPLETED', decision: JudgeDecision.CORRECT });
    }
    expect(judge.judge).toHaveBeenCalledTimes(Object.keys(TARGET_LOCALES).length);
  });

  it('keeps UNCERTAIN unresolved and retries without awarding points', async () => {
    const { matchId, guestId, answerId } =
      await createPendingAnswer('Maybe Mars?');
    const judge: FreeTextAnswerJudge = {
      judge: jest
        .fn()
        .mockResolvedValueOnce(judgeResult(JudgeDecision.UNCERTAIN, 0.42))
        .mockResolvedValueOnce(judgeResult(JudgeDecision.CORRECT, 0.96)),
    };
    const worker = new AnswerJudgeWorker(prisma, judge);

    await worker.runOnce();
    const uncertain = await prisma.answer.findUniqueOrThrow({
      where: { id: answerId },
    });
    expect(uncertain.judgeStatus).toBe('PENDING');
    expect(uncertain.decision).toBe('UNCERTAIN');
    expect(uncertain.points).toBe(0);

    const beforeRetry = await prisma.matchParticipant.findFirstOrThrow({
      where: { matchId, guestIdentityId: guestId },
    });
    expect(beforeRetry.score).toBe(0);

    await prisma.answer.update({
      where: { id: answerId },
      data: { judgeAvailableAt: new Date(Date.now() - 1_000) },
    });
    await worker.runOnce();

    const resolved = await prisma.answer.findUniqueOrThrow({
      where: { id: answerId },
    });
    expect(resolved.judgeStatus).toBe('COMPLETED');
    expect(resolved.decision).toBe('CORRECT');
    expect(resolved.judgeAttempts).toBe(2);
    expect(resolved.points).toBeGreaterThan(0);

    const afterRetry = await prisma.matchParticipant.findFirstOrThrow({
      where: { matchId, guestIdentityId: guestId },
    });
    expect(afterRetry.score).toBe(resolved.points);
    expect(judge.judge).toHaveBeenCalledTimes(2);
  });

  it('judges both participants in a cross-locale 1v1 using their immutable locale snapshots', async () => {
    const firstGuestId = await prisma.guestIdentity.create({ data: {} });
    const secondGuestId = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(firstGuestId.id, secondGuestId.id);

    const firstPrincipal = {
      principalType: PrincipalType.GUEST,
      principalId: firstGuestId.id,
      sessionId: randomUUID(),
    } as const;
    const secondPrincipal = {
      principalType: PrincipalType.GUEST,
      principalId: secondGuestId.id,
      sessionId: randomUUID(),
    } as const;

    const match = await matches.createOneVsOne(
      firstPrincipal,
      secondPrincipal,
      undefined,
      {
        category: 'science',
        language: 'en',
        participantLanguages: { first: 'en', second: 'fa' },
      },
    );
    matchIds.push(match.id);

    const started = await rounds.startNextRound(match.id, question);
    questionIds.push(started.questionId);

    // Deliberately request the opposite locale: the server-side participant
    // snapshot, not a caller-supplied locale, must determine each rendering.
    const [firstView, secondView] = await Promise.all([
      rounds.getRoundQuestion(match.id, started.roundId, firstPrincipal, 'fa'),
      rounds.getRoundQuestion(match.id, started.roundId, secondPrincipal, 'en'),
    ]);
    expect(firstView.questionId).toBe(secondView.questionId);
    expect(firstView.prompt).toBe('Which planet is known as the Red Planet?');
    expect(secondView.prompt).toBe('کدام سیاره به سیاره سرخ معروف است؟');

    const firstReceipt = await answers.submitAnswer(
      match.id,
      started.roundId,
      firstPrincipal,
      'Mars',
      randomUUID(),
    );
    const secondReceipt = await answers.submitAnswer(
      match.id,
      started.roundId,
      secondPrincipal,
      'مریخ',
      randomUUID(),
    );

    const judge: FreeTextAnswerJudge = {
      judge: jest.fn().mockResolvedValue(judgeResult(JudgeDecision.CORRECT)),
    };
    const worker = new AnswerJudgeWorker(prisma, judge);
    await expect(worker.runOnce()).resolves.toBe(true);
    await expect(worker.runOnce()).resolves.toBe(true);

    const judgedInputs = (judge.judge as jest.Mock).mock.calls.map(
      ([input]) => input,
    );
    expect(judgedInputs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        canonicalQuestion: 'Which planet is known as the Red Planet?',
        language: 'en',
        expectedAnswer: 'Mars',
        participantResponse: 'Mars',
      }),
      expect.objectContaining({
        canonicalQuestion: 'کدام سیاره به سیاره سرخ معروف است؟',
        language: 'fa',
        expectedAnswer: 'مریخ',
        gradingRubric: expect.objectContaining({ requiredConcepts: ['مریخ'] }),
        participantResponse: 'مریخ',
      }),
    ]));

    const persisted = await prisma.answer.findMany({
      where: { id: { in: [firstReceipt.answerId, secondReceipt.answerId] } },
    });
    expect(persisted).toHaveLength(2);
    expect(persisted.every(
      (answer) => answer.judgeStatus === 'COMPLETED' &&
        answer.decision === JudgeDecision.CORRECT &&
        answer.points > 0,
    )).toBe(true);
  });

});
