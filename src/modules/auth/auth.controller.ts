import { Body, Controller, Ip, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { EmailVerificationDto } from './dto/email-verification.dto';
import { EmailVerificationService } from './email-verification.service';
import { AccessTokenGuard } from '../identity/access-token.guard';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';

type PrincipalRequest = { principal: AuthenticatedPrincipal };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  @Post('register')
  register(@Body() body: RegisterDto, @Ip() ip: string) {
    return this.auth.register(body, ip);
  }

  @Post('login')
  login(@Body() body: LoginDto, @Ip() ip: string) {
    return this.auth.login(body, ip);
  }

  @Post('google')
  google(@Body() body: GoogleAuthDto, @Ip() ip: string) {
    return this.auth.googleSignIn(body.idToken, ip);
  }

  @Post('email/verify')
  verifyEmail(@Body() body: EmailVerificationDto) {
    return this.emailVerification.verify(body.token);
  }

  @UseGuards(AccessTokenGuard)
  @Post('email/resend')
  resendVerification(@Req() request: PrincipalRequest) {
    return this.emailVerification.resend(request.principal);
  }
}
