import { Module } from '@nestjs/common';
import { SessionModule } from '../session/session.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerifiedGuard } from './email-verified.guard';
import { GoogleIdentityVerifier } from './google-identity-verifier';

@Module({
  imports: [SessionModule],
  controllers: [AuthController],
  providers: [AuthService, GoogleIdentityVerifier, EmailVerifiedGuard],
  exports: [AuthService, EmailVerifiedGuard],
})
export class AuthModule {}