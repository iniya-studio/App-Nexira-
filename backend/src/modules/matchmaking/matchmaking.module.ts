import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { MatchModule } from '../match/match.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { MatchmakingController } from './matchmaking.controller';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingGateway } from './matchmaking.gateway';

@Module({
  imports: [IdentityModule, MatchModule, PrismaModule],
  controllers: [MatchmakingController],
  providers: [MatchmakingService, MatchmakingGateway],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}