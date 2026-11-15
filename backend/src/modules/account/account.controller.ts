import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../identity/access-token.guard';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { AccountService } from './account.service';
import { PasswordLifecycleService } from '../auth/password-lifecycle.service';
import { PasswordChangeDto } from './dto/password-change.dto';
import { AccountIdentityService } from './account-identity.service';
import { GoogleIdentityLinkDto } from './dto/google-identity-link.dto';

type PrincipalRequest = { principal: AuthenticatedPrincipal };

@Controller('account')
@UseGuards(AccessTokenGuard)
export class AccountController {
  constructor(private readonly accounts: AccountService, private readonly passwords: PasswordLifecycleService, private readonly identities: AccountIdentityService) {}

  @Post('identities/google/link')
  linkGoogleIdentity(@Req() request: PrincipalRequest, @Body() body: GoogleIdentityLinkDto) {
    return this.identities.linkGoogle(request.principal, body.idToken, body.nonce);
  }

  @Post('password/change')
  changePassword(@Req() request: PrincipalRequest, @Body() body: PasswordChangeDto) {
    return this.passwords.changePassword(request.principal, body.currentPassword, body.newPassword);
  }

  @Get('me')
  getMyAccount(@Req() request: PrincipalRequest) {
    return this.accounts.getMyAccount(request.principal);
  }
}
