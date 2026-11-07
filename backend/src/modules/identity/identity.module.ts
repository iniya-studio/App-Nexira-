import { Global, Module } from '@nestjs/common';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokenService } from './access-token.service';

@Global()
@Module({
  providers: [AccessTokenService, AccessTokenGuard],
  exports: [AccessTokenService, AccessTokenGuard],
})
export class IdentityModule {}
