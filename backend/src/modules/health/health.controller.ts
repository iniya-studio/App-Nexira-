import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; service: 'nexira-backend' } {
    return {
      status: 'ok',
      service: 'nexira-backend',
    };
  }
}
