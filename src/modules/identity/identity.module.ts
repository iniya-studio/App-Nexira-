import { Global, Module } from '@nestjs/common';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokenService } from './access-token.service';
import { WsAccessTokenGuard } from './ws-access-token.guard';

@Global()
@Module({
  providers: [AccessTokenService, AccessTokenGuard, WsAccessTokenGuard],
  exports: [AccessTokenService, AccessTokenGuard, WsAccessTokenGuard],
})
export class IdentityModule {}
