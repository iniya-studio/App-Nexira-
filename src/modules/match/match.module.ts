import { Module } from '@nestjs/common';
import { AnswerController } from './answer.controller';
import { FREE_TEXT_ANSWER_JUDGE } from './answer-judge.port';
import { OpenAiResponsesAnswerJudgeAdapter } from './openai-responses-answer-judge.adapter';
import { AnswerService } from './answer.service';
import { AnswerJudgeWorker } from './answer-judge.worker';
import { RoundDeadlineWorker } from './round-deadline.worker';
import { RoundFinalizationWorker } from './round-finalization.worker';
import { RoundTechnicalVoidWorker } from './round-technical-void.worker';
import { QUESTION_GENERATOR } from './question-generator.port';
import { OpenAiResponsesQuestionGeneratorAdapter } from './openai-responses-question-generator.adapter';
import { QuestionGenerationWorker } from './question-generation.worker';
import { MatchController } from './match.controller';
import { MatchService } from './match.service';
import {
  MatchQuestionRecoveryController,
  RoundController,
  RoundReadinessController,
} from './round.controller';
import { RoundService } from './round.service';

@Module({
  controllers: [
    MatchController,
    RoundController,
    RoundReadinessController,
    MatchQuestionRecoveryController,
    AnswerController,
  ],
  providers: [
    MatchService,
    RoundService,
    AnswerService,
    AnswerJudgeWorker,
    RoundDeadlineWorker,
    RoundFinalizationWorker,
    RoundTechnicalVoidWorker,
    QuestionGenerationWorker,
    {
      provide: FREE_TEXT_ANSWER_JUDGE,
      useClass: OpenAiResponsesAnswerJudgeAdapter,
    },
    {
      provide: QUESTION_GENERATOR,
      useClass: OpenAiResponsesQuestionGeneratorAdapter,
    },
  ],
  exports: [MatchService, RoundService, AnswerService],
})
export class MatchModule {}
