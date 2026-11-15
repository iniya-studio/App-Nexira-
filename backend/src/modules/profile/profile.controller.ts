import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../identity/access-token.guard';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';
type PrincipalRequest = { principal: AuthenticatedPrincipal };
@Controller('profile')
@UseGuards(AccessTokenGuard)
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}
  @Get('me')
  getMyProfile(@Req() request: PrincipalRequest) { return this.profiles.getMyProfile(request.principal); }
  @Patch('me')
  updateMyProfile(@Req() request: PrincipalRequest, @Body() body: UpdateProfileDto) {
    return this.profiles.updateMyProfile(request.principal, body);
  }
}
