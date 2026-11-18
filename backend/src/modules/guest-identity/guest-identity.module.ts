import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SessionModule } from '../session/session.module';
import { GuestIdentityController } from './guest-identity.controller';
import { GuestIdentityService } from './guest-identity.service';
import { GuestConversionReplayCleanupService } from './guest-conversion-replay-cleanup.service';

@Module({
  imports: [SessionModule, AuthModule],
  controllers: [GuestIdentityController],
  providers: [GuestIdentityService, GuestConversionReplayCleanupService],
})
export class GuestIdentityModule {}
