import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const prismaMock = {
    $queryRaw: jest.fn(),
  };
  let controller: HealthController;

  beforeEach(() => {
    prismaMock.$queryRaw.mockReset();
    controller = new HealthController(prismaMock as unknown as PrismaService);
  });

  it('returns the backend liveness status', () => {
    expect(controller.check()).toEqual({
      status: 'ok',
      service: 'nexira-backend',
    });
  });

  it('reports readiness when the database is reachable', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(controller.readiness()).resolves.toEqual({
      status: 'ok',
      service: 'nexira-backend',
      dependencies: { database: 'ok' },
    });
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns service unavailable when the database is unreachable', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('Database connection failed'));

    await expect(controller.readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
