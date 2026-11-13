import { Body, Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../identity/access-token.guard';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { EnqueueMatchmakingDto } from './dto/enqueue-matchmaking.dto';
import { MatchmakingService } from './matchmaking.service';

type PrincipalRequest = { principal: AuthenticatedPrincipal };

@Controller('matchmaking/queue')
@UseGuards(AccessTokenGuard)
export class MatchmakingController {
  constructor(private readonly matchmaking: MatchmakingService) {}

  @Post()
  enqueue(@Body() body: EnqueueMatchmakingDto, @Req() request: PrincipalRequest) {
    return this.matchmaking.enqueue(request.principal, body);
  }

  @Get('me')
  getMine(@Req() request: PrincipalRequest) {
    return this.matchmaking.getMine(request.principal);
  }

  @Delete('me')
  cancel(@Req() request: PrincipalRequest) {
    return this.matchmaking.cancel(request.principal);
  }
}