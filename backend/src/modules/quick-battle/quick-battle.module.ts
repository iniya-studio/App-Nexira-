import { Module } from '@nestjs/common';
import { QUESTION_GENERATOR } from '../match/question-generator.port';
import { OpenAiResponsesQuestionGeneratorAdapter } from '../match/openai-responses-question-generator.adapter';
import { QuickBattleController } from './quick-battle.controller';
import { QuickBattleQuestionGenerationWorker } from './quick-battle-question-generation.worker';
import { QuickBattleService } from './quick-battle.service';
import { QuickBattleRoundPublicationWorker } from './quick-battle-round-publication.worker';

@Module({
  controllers: [QuickBattleController],
  providers: [
    QuickBattleService,
    QuickBattleQuestionGenerationWorker,
    QuickBattleRoundPublicationWorker,
    { provide: QUESTION_GENERATOR, useClass: OpenAiResponsesQuestionGeneratorAdapter },
  ],
  exports: [QuickBattleService],
})
export class QuickBattleModule {}
