import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../identity/access-token.guard';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { AccountService } from './account.service';

type PrincipalRequest = { principal: AuthenticatedPrincipal };

@Controller('account')
@UseGuards(AccessTokenGuard)
export class AccountController {
  constructor(private readonly accounts: AccountService) {}

  @Get('me')
  getMyAccount(@Req() request: PrincipalRequest) {
    return this.accounts.getMyAccount(request.principal);
  }
}
