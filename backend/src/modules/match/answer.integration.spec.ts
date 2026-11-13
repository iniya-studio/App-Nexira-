import { ConflictException } from '@nestjs/common';
import { PrincipalType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { AnswerService } from './answer.service';
import { MatchService } from './match.service';
import { GeneratedQuestion } from './question.types';
import { RoundService } from './round.service';

describe('Answer submission integration', () => {
  const prisma = new PrismaService();
  const matches = new MatchService(prisma);
  const rounds = new RoundService(prisma);
  const answers = new AnswerService(prisma);
  const matchIds: string[] = [];
  const guestIds: string[] = [];
  const questionIds: string[] = [];

  const generatedQuestion: GeneratedQuestion = {
    category: 'science',
    difficulty: 'medium',
    canonicalLanguage: 'en',
    answerType: 'MULTIPLE_CHOICE',
    canonicalPrompt: 'Which planet is known as the Red Planet?',
    canonicalOptions: [
      { id: 'A', text: 'Venus' },
      { id: 'B', text: 'Mars' },
    ],
    answerKey: 'B',
    gradingRubric: { strategy: 'exact-option' },
    localized: {
      en: {
        prompt: 'Which planet is known as the Red Planet?',
        options: { A: 'Venus', B: 'Mars' },
      },
    },
    timeLimitSeconds: 30,
    contentVersion: `answer-integration-${randomUUID()}`,
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

  async function createReadyRound() {
    const first = await prisma.guestIdentity.create({ data: {} });
    const second = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(first.id, second.id);

    const match = await matches.createOneVsOne(
      {
        principalType: PrincipalType.GUEST,
        principalId: first.id,
        sessionId: randomUUID(),
      },
      {
        principalType: PrincipalType.GUEST,
        principalId: second.id,
        sessionId: randomUUID(),
      },
    );
    matchIds.push(match.id);

    const started = await rounds.startNextRound(match.id, generatedQuestion);
    questionIds.push(started.questionId);

    const firstPrincipal: AuthenticatedPrincipal = {
      principalType: PrincipalType.GUEST,
      principalId: first.id,
      sessionId: randomUUID(),
    };
    const secondPrincipal: AuthenticatedPrincipal = {
      principalType: PrincipalType.GUEST,
      principalId: second.id,
      sessionId: randomUUID(),
    };
    return {
      matchId: match.id,
      roundId: started.roundId,
      firstPrincipal,
      secondPrincipal,
    };
  }

  it('accepts both players against one shared round and exposes no score or correctness', async () => {
    const { matchId, roundId, firstPrincipal, secondPrincipal } =
      await createReadyRound();

    const [first, second] = await Promise.all([
      answers.submitAnswer(matchId, roundId, firstPrincipal, 'B', randomUUID()),
      answers.submitAnswer(
        matchId,
        roundId,
        secondPrincipal,
        'A',
        randomUUID(),
      ),
    ]);

    expect(first.roundId).toBe(second.roundId);
    expect(first.status).toBe('ACCEPTED');
    expect(second.status).toBe('ACCEPTED');
    expect(first).not.toHaveProperty('points');
    expect(first).not.toHaveProperty('decision');

    const persisted = await prisma.answer.findMany({ where: { roundId } });
    expect(persisted).toHaveLength(2);

    const correct = persisted.find((answer) => answer.responseText === 'B');
    const incorrect = persisted.find((answer) => answer.responseText === 'A');
    expect(correct).toBeDefined();
    expect(incorrect).toBeDefined();
    expect(correct?.decision).toBe('CORRECT');
    expect(correct?.judgeStatus).toBe('COMPLETED');
    expect(correct?.points).toBeGreaterThanOrEqual(12);
    expect(correct?.points).toBeLessThanOrEqual(25);
    expect(correct?.speedBonus).toBeGreaterThanOrEqual(2);
    expect(incorrect?.decision).toBe('INCORRECT');
    expect(incorrect?.judgeStatus).toBe('COMPLETED');
    expect(incorrect?.points).toBe(0);
    expect(incorrect?.speedBonus).toBe(0);

    const firstParticipant = await prisma.matchParticipant.findFirstOrThrow({
      where: { matchId, guestIdentityId: firstPrincipal.principalId },
    });
    expect(firstParticipant.score).toBe(correct?.points);
  });

  it('replays identical retries and rejects a second payload from the same participant', async () => {
    const { matchId, roundId, firstPrincipal } = await createReadyRound();
    const key = randomUUID();

    const first = await answers.submitAnswer(
      matchId,
      roundId,
      firstPrincipal,
      'B',
      key,
    );
    const replay = await answers.submitAnswer(
      matchId,
      roundId,
      firstPrincipal,
      'B',
      key,
    );

    expect(replay.answerId).toBe(first.answerId);
    expect(replay.acceptedAt).toEqual(first.acceptedAt);
    await expect(
      answers.submitAnswer(matchId, roundId, firstPrincipal, 'A', randomUUID()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.answer.count({ where: { roundId } })).toBe(1);
  });

  it('serializes concurrent duplicate submissions from one participant', async () => {
    const { matchId, roundId, firstPrincipal } = await createReadyRound();

    const outcomes = await Promise.allSettled([
      answers.submitAnswer(matchId, roundId, firstPrincipal, 'A', randomUUID()),
      answers.submitAnswer(matchId, roundId, firstPrincipal, 'B', randomUUID()),
    ]);

    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected'),
    ).toHaveLength(1);
    expect(await prisma.answer.count({ where: { roundId } })).toBe(1);
  });

  it('rejects submissions after the database deadline', async () => {
    const { matchId, roundId, firstPrincipal } = await createReadyRound();
    await prisma.round.update({
      where: { id: roundId },
      data: { deadlineAt: new Date(Date.now() - 1000) },
    });

    await expect(
      answers.submitAnswer(matchId, roundId, firstPrincipal, 'B', randomUUID()),
    ).rejects.toThrow('The answer deadline has passed');
    expect(await prisma.answer.count({ where: { roundId } })).toBe(0);
  });
});
