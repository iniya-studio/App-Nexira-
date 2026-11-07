import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../identity/access-token.guard';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { RefreshSessionDto } from './refresh-session.dto';
import { SessionService } from './session.service';

type PrincipalRequest = { principal: AuthenticatedPrincipal };

@Controller('sessions')
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  @Post('refresh')
  refresh(@Body() body: RefreshSessionDto) {
    return this.sessions.refresh(body.refreshToken, body.idempotencyKey);
  }

  @UseGuards(AccessTokenGuard)
  @Post('logout')
  logout(@Req() request: PrincipalRequest) {
    return this.sessions.logout(request.principal);
  }
}
