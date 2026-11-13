import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../identity/access-token.guard';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { ProgressionService } from './progression.service';

type PrincipalRequest = { principal: AuthenticatedPrincipal };

@Controller()
@UseGuards(AccessTokenGuard)
export class ProgressionController {
  constructor(private readonly progression: ProgressionService) {}

  @Get('progression/me')
  getMyProgress(@Req() request: PrincipalRequest) {
    return this.progression.getMyProgress(request.principal);
  }

  @Get('ranking/global')
  getGlobalRanking(@Req() request: PrincipalRequest) {
    return this.progression.getGlobalRanking(request.principal);
  }

  @Get('ranking/seasonal/current')
  getCurrentSeasonRanking(@Req() request: PrincipalRequest) {
    return this.progression.getCurrentSeasonRanking(request.principal);
  }
}
