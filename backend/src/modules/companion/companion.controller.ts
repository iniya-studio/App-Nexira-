import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
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

  @Put('appearance/:storeItemId')
  equipAppearance(
    @Param('storeItemId', new ParseUUIDPipe()) storeItemId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.profiles.equipAppearance(request.principal, storeItemId);
  }

  @Delete('appearance')
  unequipAppearance(@Req() request: AuthenticatedRequest) {
    return this.profiles.unequipAppearance(request.principal);
  }
}
