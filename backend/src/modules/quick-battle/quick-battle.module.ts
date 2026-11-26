import { Module } from '@nestjs/common';
import { QUESTION_GENERATOR } from '../match/question-generator.port';
import { OpenAiResponsesQuestionGeneratorAdapter } from '../match/openai-responses-question-generator.adapter';
import { FREE_TEXT_ANSWER_JUDGE } from '../match/answer-judge.port';
import { OpenAiResponsesAnswerJudgeAdapter } from '../match/openai-responses-answer-judge.adapter';
import { QuickBattleController } from './quick-battle.controller';
import { QuickBattleQuestionGenerationWorker } from './quick-battle-question-generation.worker';
import { QuickBattleService } from './quick-battle.service';
import { QuickBattleRoundPublicationWorker } from './quick-battle-round-publication.worker';
import { QuickBattleAnswerJudgeWorker } from './quick-battle-answer-judge.worker';
import { QuickBattleRoundFinalizationWorker } from './quick-battle-round-finalization.worker';

@Module({
  controllers: [QuickBattleController],
  providers: [
    QuickBattleService,
    QuickBattleQuestionGenerationWorker,
    QuickBattleRoundPublicationWorker,
    QuickBattleAnswerJudgeWorker,
    QuickBattleRoundFinalizationWorker,
    { provide: QUESTION_GENERATOR, useClass: OpenAiResponsesQuestionGeneratorAdapter },
    { provide: FREE_TEXT_ANSWER_JUDGE, useClass: OpenAiResponsesAnswerJudgeAdapter },
  ],
  exports: [QuickBattleService],
})
export class QuickBattleModule {}
