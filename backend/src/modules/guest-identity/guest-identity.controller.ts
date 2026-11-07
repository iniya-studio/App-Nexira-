import { Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { GuestIdentityService } from './guest-identity.service';

@Controller('guest')
export class GuestIdentityController {
  constructor(private readonly guests: GuestIdentityService) {}

  @Post('start')
  start(@Req() request: Request) {
    const forwardedFor = request.headers['x-forwarded-for'];
    const ip = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : request.ip || request.socket.remoteAddress || 'unknown';
    return this.guests.start(ip);
  }
}
