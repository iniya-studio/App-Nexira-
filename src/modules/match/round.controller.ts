import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../identity/access-token.guard';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { GetRoundQuestionDto } from './dto/get-round-question.dto';
import { RoundService } from './round.service';

type PrincipalRequest = { principal: AuthenticatedPrincipal };

@Controller('matches/:matchId/rounds/:roundId/question')
@UseGuards(AccessTokenGuard)
export class RoundController {
  constructor(private readonly rounds: RoundService) {}

  @Get()
  getQuestion(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Param('roundId', new ParseUUIDPipe()) roundId: string,
    @Query() query: GetRoundQuestionDto,
    @Req() request: PrincipalRequest,
  ) {
    return this.rounds.getRoundQuestion(
      matchId,
      roundId,
      request.principal,
      query.language?.trim() || 'en',
    );
  }
}

@Controller('matches/:matchId/question-recovery')
@UseGuards(AccessTokenGuard)
export class MatchQuestionRecoveryController {
  constructor(private readonly rounds: RoundService) {}

  @Get()
  getStatus(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Req() request: PrincipalRequest,
  ) {
    return this.rounds.getQuestionRecovery(matchId, request.principal);
  }
}

@Controller('matches/:matchId/rounds/:roundId')
@UseGuards(AccessTokenGuard)
export class RoundReadinessController {
  constructor(private readonly rounds: RoundService) {}

  @Post('ready')
  markReady(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Param('roundId', new ParseUUIDPipe()) roundId: string,
    @Req() request: PrincipalRequest,
  ) {
    return this.rounds.markRoundReady(matchId, roundId, request.principal);
  }
}
