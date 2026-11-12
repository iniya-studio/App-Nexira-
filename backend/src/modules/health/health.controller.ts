import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check(): { status: 'ok'; service: 'nexira-backend' } {
    return {
      status: 'ok',
      service: 'nexira-backend',
    };
  }

  @Get('ready')
  async readiness(): Promise<{
    status: 'ok';
    service: 'nexira-backend';
    dependencies: { database: 'ok' };
  }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'nexira-backend',
        dependencies: { database: 'unavailable' },
      });
    }

    return {
      status: 'ok',
      service: 'nexira-backend',
      dependencies: { database: 'ok' },
    };
  }
}
