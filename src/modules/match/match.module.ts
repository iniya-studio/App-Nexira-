import { Module } from '@nestjs/common';
import { MatchController } from './match.controller';
import { MatchService } from './match.service';
import { RoundService } from './round.service';

@Module({
  controllers: [MatchController],
  providers: [MatchService, RoundService],
  exports: [MatchService, RoundService],
})
export class MatchModule {}
