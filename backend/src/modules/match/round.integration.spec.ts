import { PrincipalType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchService } from './match.service';
import { GeneratedQuestion } from './question.types';
import { RoundService } from './round.service';

describe('Round persistence integration', () => {
  const prisma = new PrismaService();
  const matches = new MatchService(prisma);
  const rounds = new RoundService(prisma);
  const matchIds: string[] = [];
  const guestIds: string[] = [];
  const questionIds: string[] = [];

  const question: GeneratedQuestion = {
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
      fa: {
        prompt: 'کدام گزینه درست است؟',
        options: { A: 'گزینه الف', B: 'گزینه ب' },
      },
    },
    timeLimitSeconds: 15,
    contentVersion: 'integration-v1',
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

  it('persists one question and a shared round deadline without exposing private grading data', async () => {
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
    const stored = await prisma.round.findUnique({
      where: { id: started.roundId },
      include: { question: true },
    });
    expect(stored).not.toBeNull();
    expect(stored?.startedAt).toEqual(
      new Date(
        stored!.deadlineAt!.getTime() - question.timeLimitSeconds * 1000,
      ),
    );
    expect(stored?.question?.answerKey).toBe('B');

    const publicQuestion = await rounds.getRoundQuestion(
      match.id,
      started.roundId,
      {
        principalType: PrincipalType.GUEST,
        principalId: guest.id,
        sessionId: randomUUID(),
      },
      'fa',
    );
    expect(publicQuestion.prompt).toBe('کدام گزینه درست است؟');
    expect(publicQuestion.options.map((option) => option.id)).toEqual([
      'A',
      'B',
    ]);
    expect(publicQuestion).not.toHaveProperty('answerKey');
    expect(publicQuestion).not.toHaveProperty('gradingRubric');
  });

  it('serializes concurrent round-start attempts so only one active round is created', async () => {
    const guest = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(guest.id);
    const match = await matches.createAiMatch({
      principalType: PrincipalType.GUEST,
      principalId: guest.id,
      sessionId: randomUUID(),
    });
    matchIds.push(match.id);

    const results = await Promise.allSettled([
      rounds.startNextRound(match.id, question),
      rounds.startNextRound(match.id, question),
    ]);

    const fulfilled = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<RoundService['startNextRound']>>
      > => result.status === 'fulfilled',
    );
    expect(fulfilled).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    questionIds.push(fulfilled[0].value.questionId);
    expect(await prisma.round.count({ where: { matchId: match.id } })).toBe(1);
  });
});
