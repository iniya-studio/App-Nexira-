import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
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
  @Get()
  list(@Req() request: PrincipalRequest) {
    return this.sessions.listSessions(request.principal);
  }

  @UseGuards(AccessTokenGuard)
  @Post('logout-all')
  logoutAll(@Req() request: PrincipalRequest) {
    return this.sessions.logoutAll(request.principal);
  }

  @UseGuards(AccessTokenGuard)
  @Delete(':sessionId')
  revoke(@Req() request: PrincipalRequest, @Param('sessionId') sessionId: string) {
    return this.sessions.revokeSession(request.principal, sessionId);
  }

  @UseGuards(AccessTokenGuard)
  @Post('logout')
  logout(@Req() request: PrincipalRequest) {
    return this.sessions.logout(request.principal);
  }
}
