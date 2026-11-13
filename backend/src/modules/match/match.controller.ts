import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../identity/access-token.guard';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { CreateAiMatchDto } from './dto/create-ai-match.dto';
import { MatchService } from './match.service';

type PrincipalRequest = { principal: AuthenticatedPrincipal };

@Controller('matches')
@UseGuards(AccessTokenGuard)
export class MatchController {
  constructor(private readonly matches: MatchService) {}

  @Post('ai')
  createAiMatch(
    @Body() body: CreateAiMatchDto,
    @Req() request: PrincipalRequest,
  ) {
    return this.matches.createAiMatch(request.principal, body);
  }

  @Get(':matchId/result')
  getResult(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Req() request: PrincipalRequest,
  ) {
    return this.matches.getMatchResult(matchId, request.principal);
  }

  @Get(':matchId')
  getMatch(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Req() request: PrincipalRequest,
  ) {
    return this.matches.getMatch(matchId, request.principal);
  }
}
