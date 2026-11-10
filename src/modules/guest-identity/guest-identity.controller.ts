import { Controller, Post, Req, UseGuards, Body } from '@nestjs/common';
import { AccessTokenGuard } from '../identity/access-token.guard';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { GuestConversionDto } from './dto/guest-conversion.dto';
import { GuestIdentityService } from './guest-identity.service';

type RequestLike = {
  ip?: string;
  socket: { remoteAddress?: string };
};
type PrincipalRequest = { principal: AuthenticatedPrincipal };

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

  @UseGuards(AccessTokenGuard)
  @Post('convert')
  convert(@Req() request: PrincipalRequest, @Body() body: GuestConversionDto) {
    return this.guests.convert(request.principal, body);
  }
}
