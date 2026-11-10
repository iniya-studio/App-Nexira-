import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../identity/access-token.guard';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { CompanionProfileService } from './companion-profile.service';

type AuthenticatedRequest = { principal: AuthenticatedPrincipal };

@Controller('companion')
@UseGuards(AccessTokenGuard)
export class CompanionController {
  constructor(private readonly profiles: CompanionProfileService) {}

  @Get('profile')
  getProfile(@Req() request: AuthenticatedRequest) {
    return this.profiles.getOrCreate(request.principal);
  }
}
