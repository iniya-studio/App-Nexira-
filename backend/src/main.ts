import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/http/api-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const proxyHops = Number(config.get<string>('TRUST_PROXY_HOPS', '0'));
  if (!Number.isSafeInteger(proxyHops) || proxyHops < 0) {
    throw new Error('TRUST_PROXY_HOPS must be a non-negative integer');
  }
  app.getHttpAdapter().getInstance().set('trust proxy', proxyHops);
  const corsOrigins = (config.get<string>(
    'CORS_ORIGINS',
    'https://localhost,capacitor://localhost',
  ) ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one allowed origin');
  }
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    credentials: false,
    maxAge: 86_400,
  });
  app.setGlobalPrefix(config.get<string>('API_PREFIX', 'api/v1'));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
