import { Body, Controller, Ip, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
}