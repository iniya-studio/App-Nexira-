import { Controller, Post, Req } from '@nestjs/common';
import { GuestIdentityService } from './guest-identity.service';

type RequestLike = {
  ip?: string;
  socket: { remoteAddress?: string };
};

@Controller('guest')
export class GuestIdentityController {
  constructor(private readonly guests: GuestIdentityService) {}

  @Post('start')
  start(@Req() request: RequestLike) {
    // Use the socket-derived Express IP. Do not trust arbitrary forwarded headers
    // unless a trusted proxy chain is explicitly configured.
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    return this.guests.start(ip);
  }
}
