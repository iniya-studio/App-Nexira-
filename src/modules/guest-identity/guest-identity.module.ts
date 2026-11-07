import { Module } from '@nestjs/common';
import { SessionModule } from '../session/session.module';
import { GuestIdentityController } from './guest-identity.controller';
import { GuestIdentityService } from './guest-identity.service';

@Module({
  imports: [SessionModule],
  controllers: [GuestIdentityController],
  providers: [GuestIdentityService],
})
export class GuestIdentityModule {}
