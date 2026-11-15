import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { AccountIdentityService } from './account-identity.service';

@Module({
  imports: [AuthModule],
  controllers: [AccountController],
  providers: [AccountService, AccountIdentityService],
})
export class AccountModule {}
