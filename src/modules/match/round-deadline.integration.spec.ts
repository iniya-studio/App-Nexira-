import { randomUUID } from 'node:crypto';
import {
  AnswerStatus,
  JudgeDecision,
  JudgeStatus,
  MatchStatus,
  ParticipantStatus,
  ParticipantType,
  PrincipalType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchService } from './match.service';
import { RoundDeadlineWorker } from './round-deadline.worker';

describe('Round deadline and no-response scoring integration', () => {
  const prisma = new PrismaService();
  const matches = new MatchService(prisma);
  const worker = new RoundDeadlineWorker(prisma);
  const matchIds: string[] = [];
  const guestIds: string[] = [];
  const questionIds: string[] = [];

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
      await prisma.guestIdentity.deleteMany({ where: { id: { in: guestIds } } });
      guestIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createScenario(
    previousOutcomes: Array<Array<'NO_RESPONSE' | 'ANSWERED'>>,
    currentAnswers: number[],
  ) {
    const guestOne = await prisma.guestIdentity.create({ data: {} });
    const guestTwo = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(guestOne.id, guestTwo.id);

    const match = await matches.createOneVsOne(
      {
        principalType: PrincipalType.GUEST,
        principalId: guestOne.id,
        sessionId: randomUUID(),
      },
      {
        principalType: PrincipalType.GUEST,
        principalId: guestTwo.id,
        sessionId: randomUUID(),
      },
    );
    matchIds.push(match.id);

    const participants = await prisma.matchParticipant.findMany({
      where: { matchId: match.id },
      orderBy: { joinedAt: 'asc' },
    });
    const totalRounds = previousOutcomes.length + 1;
    const rounds = [];

    for (let index = 1; index <= totalRounds; index += 1) {
      const now = new Date(Date.now() - 60_000 + index * 1_000);
      const question = await prisma.question.create({
        data: {
          canonicalLanguage: 'en',
          answerType: 'MULTIPLE_CHOICE',
          canonicalPrompt: 'Which option is correct?',
          canonicalOptions: [
            { id: 'A', text: 'Option A' },
            { id: 'B', text: 'Option B' },
          ],
          answerKey: 'B',
          gradingRubric: { strategy: 'exact-option' },
          localized: { en: { prompt: 'Which option is correct?' } },
          timeLimitSeconds: 20,
          contentVersion: 'deadline-' + randomUUID(),
        },
      });
      questionIds.push(question.id);

      const round = await prisma.round.create({
        data: {
          matchId: match.id,
          roundNumber: index,
          questionId: question.id,
          startedAt: now,
          deadlineAt: new Date(now.getTime() + 20_000),
          completedAt:
            index < totalRounds ? new Date(now.getTime() + 20_000) : null,
        },
      });
      rounds.push(round);

      if (index < totalRounds) {
        const outcomes = previousOutcomes[index - 1];
        for (let participantIndex = 0; participantIndex < 2; participantIndex += 1) {
          const outcome = outcomes[participantIndex];
          const answer = await prisma.answer.create({
            data: {
              matchId: match.id,
              roundId: round.id,
              participantId: participants[participantIndex].id,
              responseText: outcome === 'ANSWERED' ? 'B' : null,
              status:
                outcome === 'ANSWERED'
                  ? AnswerStatus.ANSWERED
                  : AnswerStatus.NO_RESPONSE,
              judgeStatus:
                outcome === 'ANSWERED'
                  ? JudgeStatus.COMPLETED
                  : JudgeStatus.NOT_REQUIRED,
              decision:
                outcome === 'ANSWERED' ? JudgeDecision.CORRECT : null,
              confidence: outcome === 'ANSWERED' ? 1 : null,
              elapsedMs: 20_000,
              points: 0,
              speedBonus: 0,
              idempotencyKey:
                'seed:' + round.id + ':' + participants[participantIndex].id,
              acceptedAt: round.deadlineAt!,
            },
          });

          if (outcome === 'NO_RESPONSE' && participants[participantIndex].participantType === ParticipantType.HUMAN) {
            await prisma.matchScoreEntry.create({
              data: {
                matchId: match.id,
                participantId: participants[participantIndex].id,
                roundId: round.id,
                entryType: 'NO_RESPONSE_PENALTY',
                pointsChange: -5,
                idempotencyKey: 'seed-penalty:' + answer.id,
              },
            });
            await prisma.matchParticipant.update({
              where: { id: participants[participantIndex].id },
              data: { score: { decrement: 5 } },
            });
          }
        }
      }
    }

    for (const participantIndex of currentAnswers) {
      await prisma.answer.create({
        data: {
          matchId: match.id,
          roundId: rounds[totalRounds - 1].id,
          participantId: participants[participantIndex].id,
          responseText: 'B',
          status: AnswerStatus.ANSWERED,
          judgeStatus: JudgeStatus.COMPLETED,
          decision: JudgeDecision.CORRECT,
          confidence: 1,
          elapsedMs: 1_000,
          points: 0,
          speedBonus: 0,
          idempotencyKey:
            'current-answer:' + rounds[totalRounds - 1].id + ':' + participants[participantIndex].id,
          acceptedAt: rounds[totalRounds - 1].startedAt!,
        },
      });
    }

    await prisma.match.update({
      where: { id: match.id },
      data: {
        status: MatchStatus.ACTIVE,
        currentRound: totalRounds,
        startedAt: rounds[0].startedAt,
      },
    });
    await prisma.round.update({
      where: { id: rounds[totalRounds - 1].id },
      data: { deadlineAt: new Date(Date.now() - 1_000) },
    });

    return {\n      matchId: match.id,\n      roundId: rounds[totalRounds - 1].id,\n      roundIds: rounds.map((round) => round.id),\n      participants,\n    };
  }

  it('applies the third consecutive penalty and one +20 transfer exactly once', async () => {
    const scenario = await createScenario(
      [
        ['NO_RESPONSE', 'ANSWERED'],
        ['NO_RESPONSE', 'ANSWERED'],
      ],
      [1],
    );

    expect(await worker.runOnce()).toBe(true);
    expect(await worker.runOnce()).toBe(false);

    const timeout = await prisma.answer.findUnique({
      where: {
        roundId_participantId: {
          roundId: scenario.roundId,
          participantId: scenario.participants[0].id,
        },
      },
    });
    expect(timeout?.status).toBe(AnswerStatus.NO_RESPONSE);

    const entries = await prisma.matchScoreEntry.findMany({
      where: { roundId: scenario.roundId },
      orderBy: { pointsChange: 'asc' },
    });
    expect(entries.map((entry) => [entry.entryType, entry.pointsChange])).toEqual([
      ['NO_RESPONSE_PENALTY', -10],
      ['FORFEIT_TRANSFER', 20],
    ]);

    const first = await prisma.matchParticipant.findUniqueOrThrow({
      where: { id: scenario.participants[0].id },
    });
    const second = await prisma.matchParticipant.findUniqueOrThrow({
      where: { id: scenario.participants[1].id },
    });
    expect(first.score).toBe(-20);
    expect(first.status).toBe(ParticipantStatus.FORFEITED);
    expect(second.score).toBe(20);
    expect(second.status).toBe(ParticipantStatus.COMPLETED);

    const result = await prisma.matchResult.findUniqueOrThrow({
      where: { matchId: scenario.matchId },
    });
    expect(result.winnerParticipantId).toBe(second.id);
    expect(result.resultSummary).toMatchObject({
      outcome: 'CONSECUTIVE_NO_RESPONSE_FORFEIT',
      transferPoints: 20,
    });
  });

  it('resets a no-response streak after a valid answer', async () => {
    const scenario = await createScenario(
      [['NO_RESPONSE', 'ANSWERED'], ['ANSWERED', 'ANSWERED']],
      [1],
    );

    expect(await worker.runOnce()).toBe(true);

    const penalty = await prisma.matchScoreEntry.findFirstOrThrow({
      where: {
        roundId: scenario.roundId,
        participantId: scenario.participants[0].id,
        entryType: 'NO_RESPONSE_PENALTY',
      },
    });
    expect(penalty.pointsChange).toBe(-5);
    expect(await prisma.matchResult.findUnique({ where: { matchId: scenario.matchId } })).toBeNull();
  });

  it('does not carry a no-response streak across a round with no participant outcome', async () => {
    const scenario = await createScenario(
      [['NO_RESPONSE', 'ANSWERED'], ['ANSWERED', 'ANSWERED']],
      [1],
    );

    await prisma.answer.delete({
      where: {
        roundId_participantId: {
          roundId: scenario.roundIds[1],
          participantId: scenario.participants[0].id,
        },
      },
    });

    expect(await worker.runOnce()).toBe(true);
    const penalty = await prisma.matchScoreEntry.findFirstOrThrow({
      where: {
        roundId: scenario.roundId,
        participantId: scenario.participants[0].id,
        entryType: 'NO_RESPONSE_PENALTY',
      },
    });
    expect(penalty.pointsChange).toBe(-5);
  });

  it('settles simultaneous forfeits as a draw without a transfer', async () => {
    const scenario = await createScenario(
      [
        ['NO_RESPONSE', 'NO_RESPONSE'],
        ['NO_RESPONSE', 'NO_RESPONSE'],
      ],
      [],
    );

    expect(await worker.runOnce()).toBe(true);

    const transferCount = await prisma.matchScoreEntry.count({
      where: { matchId: scenario.matchId, entryType: 'FORFEIT_TRANSFER' },
    });
    expect(transferCount).toBe(0);

    const result = await prisma.matchResult.findUniqueOrThrow({
      where: { matchId: scenario.matchId },
    });
    expect(result.winnerParticipantId).toBeNull();
    expect(result.resultSummary).toMatchObject({
      outcome: 'MUTUAL_FORFEIT_DRAW',
      transferPoints: 0,
    });
  });
});
