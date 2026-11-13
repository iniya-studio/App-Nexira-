import { JudgeDecision, PrincipalType } from '@prisma/client';
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
    localized: {
      en: { prompt: 'Which planet is known as the Red Planet?' },
    },
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

  async function createPendingAnswer(responseText: string) {
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
});
