import { Module } from '@nestjs/common';
import { AnswerController } from './answer.controller';
import { FREE_TEXT_ANSWER_JUDGE } from './answer-judge.port';
import { OpenAiResponsesAnswerJudgeAdapter } from './openai-responses-answer-judge.adapter';
import { AnswerService } from './answer.service';
import { AnswerJudgeWorker } from './answer-judge.worker';
import { RoundDeadlineWorker } from './round-deadline.worker';
import { RoundFinalizationWorker } from './round-finalization.worker';
import { MatchController } from './match.controller';
import { MatchService } from './match.service';
import { RoundController } from './round.controller';
import { RoundService } from './round.service';

@Module({
  controllers: [MatchController, RoundController, AnswerController],
  providers: [
    MatchService,
    RoundService,
    AnswerService,
    AnswerJudgeWorker,
    RoundDeadlineWorker,
    RoundFinalizationWorker,
    {
      provide: FREE_TEXT_ANSWER_JUDGE,
      useClass: OpenAiResponsesAnswerJudgeAdapter,
    },
  ],
  exports: [MatchService, RoundService, AnswerService],
})
export class MatchModule {}
