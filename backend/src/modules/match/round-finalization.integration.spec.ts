import { AnswerStatus, JudgeStatus, PrincipalType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AnswerService } from './answer.service';
import { MatchService } from './match.service';
import { GeneratedQuestion } from './question.types';
import { RoundFinalizationWorker } from './round-finalization.worker';
import { RoundService } from './round.service';

describe('Round finalization integration', () => {
  const prisma = new PrismaService();
  const matches = new MatchService(prisma);
  const rounds = new RoundService(prisma);
  const answers = new AnswerService(prisma);
  const worker = new RoundFinalizationWorker(prisma);
  const matchIds: string[] = [];
  const guestIds: string[] = [];
  const questionIds: string[] = [];

  const mcq: GeneratedQuestion = {
    category: 'general',
    difficulty: 'medium',
    canonicalLanguage: 'en',
    answerType: 'MULTIPLE_CHOICE',
    canonicalPrompt: 'Which option is correct?',
    canonicalOptions: [
      { id: 'A', text: 'Option A' },
      { id: 'B', text: 'Option B' },
    ],
    answerKey: 'B',
    gradingRubric: { type: 'exact-option' },
    localized: {
      en: {
        prompt: 'Which option is correct?',
        options: { A: 'Option A', B: 'Option B' },
      },
    },
    timeLimitSeconds: 30,
    contentVersion: 'round-finalization-test-v1',
  };

  const freeText: GeneratedQuestion = {
    ...mcq,
    answerType: 'FREE_TEXT',
    canonicalOptions: null,
    answerKey: 'Paris',
    gradingRubric: { requiredConcepts: ['Paris'] },
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
      await prisma.guestIdentity.deleteMany({
        where: { id: { in: guestIds } },
      });
      guestIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createMatch(question: GeneratedQuestion) {
    const [firstGuest, secondGuest] = await Promise.all([
      prisma.guestIdentity.create({ data: {} }),
      prisma.guestIdentity.create({ data: {} }),
    ]);
    guestIds.push(firstGuest.id, secondGuest.id);

    const first = {
      principalType: PrincipalType.GUEST,
      principalId: firstGuest.id,
      sessionId: randomUUID(),
    };
    const second = {
      principalType: PrincipalType.GUEST,
      principalId: secondGuest.id,
      sessionId: randomUUID(),
    };
    const match = await matches.createOneVsOne(first, second);
    matchIds.push(match.id);
    const started = await rounds.startNextRound(match.id, question);
    questionIds.push(started.questionId);
    return { match, started, first, second };
  }

  it('completes early exactly once after both participants have final answers', async () => {
    const { match, started, first, second } = await createMatch(mcq);

    await Promise.all([
      answers.submitAnswer(
        match.id,
        started.roundId,
        first,
        'B',
        'answer-first-001',
      ),
      answers.submitAnswer(
        match.id,
        started.roundId,
        second,
        'A',
        'answer-second-001',
      ),
    ]);

    expect(await worker.runOnce()).toBe(true);
    const completed = await prisma.round.findUnique({
      where: { id: started.roundId },
      select: { completedAt: true },
    });
    expect(completed?.completedAt).toBeInstanceOf(Date);

    expect(await worker.runOnce()).toBe(false);
    const count = await prisma.round.count({
      where: { matchId: match.id, completedAt: { not: null } },
    });
    expect(count).toBe(1);
  });

  it('does not complete while one participant has not answered', async () => {
    const { match, started, first } = await createMatch(mcq);

    await answers.submitAnswer(
      match.id,
      started.roundId,
      first,
      'B',
      'answer-only-001',
    );

    expect(await worker.runOnce()).toBe(false);
    const round = await prisma.round.findUnique({
      where: { id: started.roundId },
      select: { completedAt: true },
    });
    expect(round?.completedAt).toBeNull();
  });

  it('does not complete while free-text AI Judge decisions are pending', async () => {
    const { match, started, first, second } = await createMatch(freeText);

    await Promise.all([
      answers.submitAnswer(
        match.id,
        started.roundId,
        first,
        'Paris',
        'free-text-first-001',
      ),
      answers.submitAnswer(
        match.id,
        started.roundId,
        second,
        'Paris',
        'free-text-second-001',
      ),
    ]);

    const pending = await prisma.answer.count({
      where: {
        roundId: started.roundId,
        status: AnswerStatus.ANSWERED,
        judgeStatus: JudgeStatus.PENDING,
      },
    });
    expect(pending).toBe(2);
    expect(await worker.runOnce()).toBe(false);
  });
});
