import { Module } from '@nestjs/common';
import { AnswerController } from './answer.controller';
import { AnswerService } from './answer.service';
import { MatchController } from './match.controller';
import { MatchService } from './match.service';
import { RoundController } from './round.controller';
import { RoundService } from './round.service';

@Module({
  controllers: [MatchController, RoundController, AnswerController],
  providers: [MatchService, RoundService, AnswerService],
  exports: [MatchService, RoundService, AnswerService],
})
export class MatchModule {}
