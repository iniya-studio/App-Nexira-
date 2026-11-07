import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { GuestIdentityModule } from './modules/guest-identity/guest-identity.module';
import { IdentityModule } from './modules/identity/identity.module';
import { SessionModule } from './modules/session/session.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    IdentityModule,
    SessionModule,
    GuestIdentityModule,
    AuthModule,
    HealthModule,
  ],
})
export class AppModule {}