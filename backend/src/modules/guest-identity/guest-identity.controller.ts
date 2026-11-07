import { Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { GuestIdentityService } from './guest-identity.service';

@Controller('guest')
export class GuestIdentityController {
  constructor(private readonly guests: GuestIdentityService) {}

  @Post('start')
  start(@Req() request: Request) {
    // Use the socket-derived Express IP. Do not trust arbitrary X-Forwarded-For
    // values unless a trusted proxy chain is explicitly configured. 
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    return this.guests.start(ip);
  }
}
