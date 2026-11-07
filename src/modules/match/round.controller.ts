import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
