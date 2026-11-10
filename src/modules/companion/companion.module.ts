import { Module } from '@nestjs/common';
import { CompanionController } from './companion.controller';
import { CompanionProfileService } from './companion-profile.service';

@Module({
  controllers: [CompanionController],
  providers: [CompanionProfileService],
  exports: [CompanionProfileService],
})
export class CompanionModule {}
