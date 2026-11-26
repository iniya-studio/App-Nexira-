import { Module } from '@nestjs/common';
import { QuickBattleController } from './quick-battle.controller';
import { QuickBattleService } from './quick-battle.service';

@Module({
  controllers: [QuickBattleController],
  providers: [QuickBattleService],
  exports: [QuickBattleService],
})
export class QuickBattleModule {}
