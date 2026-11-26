import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../identity/access-token.guard';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { CreateQuickBattleDto, SubmitQuickBattleAnswerDto } from './quick-battle.dto';
import { QuickBattleService } from './quick-battle.service';

type PrincipalRequest = { principal: AuthenticatedPrincipal };

@Controller('quick-battles')
@UseGuards(AccessTokenGuard)
export class QuickBattleController {
  constructor(private readonly quickBattles: QuickBattleService) {}

  @Post()
  createOrRecover(
    @Body() body: CreateQuickBattleDto,
    @Req() request: PrincipalRequest,
  ) {
    return this.quickBattles.createOrRecover(request.principal, body.language);
  }

  @Get('active')
  getActive(@Req() request: PrincipalRequest) {
    return this.quickBattles.getActive(request.principal);
  }

  @Get(':matchId/current-round')
  getCurrentRound(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Req() request: PrincipalRequest,
  ) {
    return this.quickBattles.getCurrentRound(matchId, request.principal);
  }

  @Post(':matchId/rounds/:roundNumber/answers')
  submitAnswer(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Param('roundNumber', new ParseIntPipe()) roundNumber: number,
    @Body() body: SubmitQuickBattleAnswerDto,
    @Req() request: PrincipalRequest,
  ) {
    return this.quickBattles.submitAnswer(
      matchId, roundNumber, request.principal, body.responseText, body.idempotencyKey,
    );
  }

  @Get(':matchId')
  getMatch(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Req() request: PrincipalRequest,
  ) {
    return this.quickBattles.getMatch(matchId, request.principal);
  }
}
