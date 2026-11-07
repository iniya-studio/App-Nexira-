import { Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../identity/access-token.guard';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { MatchService } from './match.service';

type PrincipalRequest = { principal: AuthenticatedPrincipal };

@Controller('matches')
@UseGuards(AccessTokenGuard)
export class MatchController {
  constructor(private readonly matches: MatchService) {}

  @Post('ai')
  createAiMatch(@Req() request: PrincipalRequest) {
    return this.matches.createAiMatch(request.principal);
  }

  @Get(':matchId')
  getMatch(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Req() request: PrincipalRequest,
  ) {
    return this.matches.getMatch(matchId, request.principal);
  }
}
