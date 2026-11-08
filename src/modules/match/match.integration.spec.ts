import { PrincipalType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchService } from './match.service';
import { GeneratedQuestion } from './question.types';
import { RoundService } from './round.service';

describe('Match and round persistence integration', () => {
  const prisma = new PrismaService();
  const matches = new MatchService(prisma);
  const rounds = new RoundService(prisma);
  const matchIds: string[] = [];
  const guestIds: string[] = [];
  const userIds: string[] = [];
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
      fa: {
        prompt: 'کدام سیاره به سیاره سرخ معروف است؟',
        options: { A: 'زهره', B: 'مریخ' },
      },
    },
    timeLimitSeconds: 20,
    contentVersion: `integration-${randomUUID()}`,
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
    if (userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createGuest() {
    const guest = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(guest.id);
    return guest.id;
  }

  async function createGuestOneVsOne() {
    const firstGuestId = await createGuest();
    const secondGuestId = await createGuest();
    const match = await matches.createOneVsOne(
      {
        principalType: PrincipalType.GUEST,
        principalId: firstGuestId,
        sessionId: randomUUID(),
      },
      {
        principalType: PrincipalType.GUEST,
        principalId: secondGuestId,
        sessionId: randomUUID(),
      },
    );
    matchIds.push(match.id);
    return { matchId: match.id, firstGuestId, secondGuestId };
  }

  it('starts one synchronized round and gives both humans the same question and deadline', async () => {
    const { matchId, firstGuestId, secondGuestId } =
      await createGuestOneVsOne();

    const started = await rounds.startNextRound(matchId, generatedQuestion);
    questionIds.push(started.questionId);

    expect(started.matchId).toBe(matchId);
    expect(started.roundNumber).toBe(1);
    expect(started.startedAt).toBeInstanceOf(Date);
    expect(started.deadlineAt.getTime() - started.startedAt.getTime()).toBe(
      20_000,
    );

    const storedMatch = await prisma.match.findUnique({
      where: { id: matchId },
      include: { participants: true, rounds: true },
    });
    expect(storedMatch?.status).toBe('ACTIVE');
    expect(storedMatch?.currentRound).toBe(1);
    expect(storedMatch?.participants).toHaveLength(2);
    expect(storedMatch?.rounds).toHaveLength(1);
    expect(storedMatch?.rounds[0].startedAt).toEqual(started.startedAt);
    expect(storedMatch?.rounds[0].deadlineAt).toEqual(started.deadlineAt);

    const firstView = await rounds.getRoundQuestion(
      matchId,
      started.roundId,
      {
        principalType: PrincipalType.GUEST,
        principalId: firstGuestId,
        sessionId: randomUUID(),
      },
      'en',
    );
    const secondView = await rounds.getRoundQuestion(
      matchId,
      started.roundId,
      {
        principalType: PrincipalType.GUEST,
        principalId: secondGuestId,
        sessionId: randomUUID(),
      },
      'fa',
    );

    expect(firstView.questionId).toBe(secondView.questionId);
    expect(firstView.startedAt).toEqual(secondView.startedAt);
    expect(firstView.deadlineAt).toEqual(secondView.deadlineAt);
    expect(firstView.options.map((option) => option.id)).toEqual(
      secondView.options.map((option) => option.id),
    );
    expect(firstView.prompt).toBe('Which planet is known as the Red Planet?');
    expect(secondView.prompt).toBe('کدام سیاره به سیاره سرخ معروف است؟');
    expect(secondView).not.toHaveProperty('answerKey');
    expect(secondView).not.toHaveProperty('gradingRubric');
  });

  it('allows only one concurrent first-round start to commit', async () => {
    const { matchId } = await createGuestOneVsOne();

    const outcomes = await Promise.allSettled([
      rounds.startNextRound(matchId, generatedQuestion),
      rounds.startNextRound(matchId, generatedQuestion),
    ]);

    const fulfilled = outcomes.filter(
      (
        outcome,
      ): outcome is PromiseFulfilledResult<
        Awaited<ReturnType<RoundService['startNextRound']>>
      > => outcome.status === 'fulfilled',
    );
    expect(fulfilled).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected'),
    ).toHaveLength(1);
    questionIds.push(fulfilled[0].value.questionId);
    expect(await prisma.round.count({ where: { matchId } })).toBe(1);
    expect(
      await prisma.match.count({
        where: { id: matchId, status: 'ACTIVE', currentRound: 1 },
      }),
    ).toBe(1);
  });

  it('persists a guest 1vAI match and hides it from non-participants', async () => {
    const guestId = await createGuest();

    const result = await matches.createAiMatch({
      principalType: PrincipalType.GUEST,
      principalId: guestId,
      sessionId: randomUUID(),
    });
    matchIds.push(result.id);

    const stored = await prisma.match.findUnique({
      where: { id: result.id },
      include: { participants: true },
    });

    expect(stored?.mode).toBe('ONE_V_AI');
    expect(stored?.status).toBe('WAITING');
    expect(stored?.participants).toHaveLength(2);
    expect(
      stored?.participants.filter(
        (participant) => participant.participantType === 'HUMAN',
      ),
    ).toHaveLength(1);
    expect(
      stored?.participants.filter(
        (participant) => participant.participantType === 'AI',
      ),
    ).toHaveLength(1);
    expect(
      stored?.participants.find(
        (participant) => participant.participantType === 'HUMAN',
      )?.guestIdentityId,
    ).toBe(guestId);

    await expect(
      matches.getMatch(result.id, {
        principalType: PrincipalType.GUEST,
        principalId: guestId,
        sessionId: randomUUID(),
      }),
    ).resolves.toMatchObject({ id: result.id });

    const outsiderId = await createGuest();
    await expect(
      matches.getMatch(result.id, {
        principalType: PrincipalType.GUEST,
        principalId: outsiderId,
        sessionId: randomUUID(),
      }),
    ).rejects.toThrow('Match not found');
  });

  it('persists registered ownership without allowing guest ownership fields', async () => {
    const user = await prisma.user.create({
      data: {
        username: `match-${randomUUID()}`,
        displayName: 'Match Integration',
      },
    });
    userIds.push(user.id);

    const result = await matches.createAiMatch({
      principalType: PrincipalType.USER,
      principalId: user.id,
      sessionId: randomUUID(),
    });
    matchIds.push(result.id);

    const human = await prisma.matchParticipant.findFirst({
      where: { matchId: result.id, participantType: 'HUMAN' },
    });
    expect(human?.userId).toBe(user.id);
    expect(human?.guestIdentityId).toBeNull();
  });
});
