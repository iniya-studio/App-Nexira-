import { Module } from '@nestjs/common';
import { SessionModule } from '../session/session.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerifiedGuard } from './email-verified.guard';
import { GoogleIdentityVerifier } from './google-identity-verifier';
import { EmailVerificationService } from './email-verification.service';
import { EmailDeliveryService } from './email-delivery.service';

@Module({
  imports: [SessionModule],
  controllers: [AuthController],
  providers: [AuthService, GoogleIdentityVerifier, EmailVerifiedGuard, EmailVerificationService, EmailDeliveryService],
  exports: [AuthService, EmailVerifiedGuard],
})
export class AuthModule {}