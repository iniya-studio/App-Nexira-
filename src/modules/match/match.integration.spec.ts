import { PrincipalType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchService } from './match.service';

describe('Match persistence integration', () => {
  const prisma = new PrismaService();
  const service = new MatchService(prisma);
  const matchIds: string[] = [];
  const guestIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (matchIds.length) {
      await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
      matchIds.length = 0;
    }
    if (guestIds.length) {
      await prisma.guestIdentity.deleteMany({ where: { id: { in: guestIds } } });
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

  it('persists a guest 1vAI match with exactly one human and one AI participant', async () => {
    const guest = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(guest.id);

    const result = await service.createAiMatch({
      principalType: PrincipalType.GUEST,
      principalId: guest.id,
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
    expect(stored?.participants.filter((participant) => participant.participantType === 'HUMAN')).toHaveLength(1);
    expect(stored?.participants.filter((participant) => participant.participantType === 'AI')).toHaveLength(1);
    expect(stored?.participants.find((participant) => participant.participantType === 'HUMAN')?.guestIdentityId).toBe(guest.id);

    await expect(
      service.getMatch(result.id, {
        principalType: PrincipalType.GUEST,
        principalId: guest.id,
        sessionId: randomUUID(),
      }),
    ).resolves.toMatchObject({ id: result.id });

    const outsider = await prisma.guestIdentity.create({ data: {} });
    guestIds.push(outsider.id);
    await expect(
      service.getMatch(result.id, {
        principalType: PrincipalType.GUEST,
        principalId: outsider.id,
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

    const result = await service.createAiMatch({
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
