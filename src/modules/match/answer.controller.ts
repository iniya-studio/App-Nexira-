import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../identity/access-token.guard';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { AnswerService } from './answer.service';

type PrincipalRequest = { principal: AuthenticatedPrincipal };

@Controller('matches/:matchId/rounds/:roundId/answers')
@UseGuards(AccessTokenGuard)
export class AnswerController {
  constructor(private readonly answers: AnswerService) {}

  @Post()
  submit(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Param('roundId', new ParseUUIDPipe()) roundId: string,
    @Body() body: SubmitAnswerDto,
    @Req() request: PrincipalRequest,
  ) {
    return this.answers.submitAnswer(
      matchId,
      roundId,
      request.principal,
      body.responseText,
      body.idempotencyKey,
    );
  }
}
