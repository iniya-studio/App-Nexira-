import { BadRequestException, ConflictException } from '@nestjs/common';
import { MatchMode, MatchStatus, ParticipantType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RoundService } from './round.service';

describe('RoundService', () => {
  const startedAt = new Date('2026-11-08T00:00:00.000Z');
  const question = { id: 'question-1', timeLimitSeconds: 20 };

  function setup(participants = [
    { participantType: ParticipantType.HUMAN },
    { participantType: ParticipantType.HUMAN },
  ]) {
    const tx = {
      match: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'match-1',
          mode: MatchMode.ONE_V_ONE,
          status: MatchStatus.WAITING,
          currentRound: 0,
          participants,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      question: { findUnique: jest.fn().mockResolvedValue(question) },
      $queryRaw: jest.fn().mockResolvedValue([{ now: startedAt }]),
      round: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'round-1',
          ...data,
        })),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    return { service: new RoundService(prisma), prisma, tx };
  }

  it('starts a round with a shared database-derived deadline', async () => {
    const { service, tx } = setup();

    const result = await service.startFirstRound('match-1', 'question-1');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.match.updateMany).toHaveBeenCalledWith({
      where: { id: 'match-1', status: MatchStatus.WAITING, currentRound: 0 },
      data: { status: MatchStatus.ACTIVE, currentRound: 1, startedAt },
    });
    expect(tx.round.create).toHaveBeenCalledWith({
      data: {
        matchId: 'match-1',
        roundNumber: 1,
        questionId: 'question-1',
        startedAt,
        deadlineAt: new Date(startedAt.getTime() + 20_000),
      },
      select: {
        id: true,
        matchId: true,
        roundNumber: true,
        startedAt: true,
        deadlineAt: true,
      },
    });
    expect(result.deadlineAt).toEqual(new Date(startedAt.getTime() + 20_000));
  });

  it('rejects invalid participant composition before changing match state', async () => {
    const { service, tx } = setup([{ participantType: ParticipantType.AI }, { participantType: ParticipantType.AI }]);

    await expect(service.startFirstRound('match-1', 'question-1')).rejects.toThrow(
      'Participant types do not satisfy the V1 match mode',
    );
    expect(tx.match.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent or repeated start when the conditional claim fails', async () => {
    const { service, tx } = setup();
    tx.match.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.startFirstRound('match-1', 'question-1')).rejects.toThrow(
      'Match was started by another operation',
    );
    expect(tx.round.create).not.toHaveBeenCalled();
  });

  it('uses serializable isolation for the start transition', async () => {
    const { service, prisma } = setup();

    await service.startFirstRound('match-1', 'question-1');

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  });

  it('rejects non-positive question time limits', async () => {
    const { service, tx } = setup();
    tx.question.findUnique.mockResolvedValue({ id: 'question-1', timeLimitSeconds: 0 });

    await expect(service.startFirstRound('match-1', 'question-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.match.updateMany).not.toHaveBeenCalled();
  });
});
