import { Controller, Get, HttpException, HttpStatus, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiExceptionFilter } from './api-exception.filter';

@Controller('error-contract')
class ErrorContractController {
  @Get('validation')
  validation(): never {
    throw new HttpException({
      statusCode: HttpStatus.BAD_REQUEST,
      message: ['email must be valid'],
      error: 'Bad Request',
      internal: 'must-not-leak',
    }, HttpStatus.BAD_REQUEST);
  }

  @Get('conversion-expired')
  conversionExpired(): never {
    throw new HttpException({
      code: 'CONVERSION_RECOVERY_EXPIRED',
      message: 'Conversion recovery window has expired',
    }, HttpStatus.GONE);
  }
}

@Module({ controllers: [ErrorContractController] })
class ErrorContractTestModule {}

describe('ApiExceptionFilter HTTP integration', () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;

  beforeAll(async () => {
    app = await NestFactory.create(ErrorContractTestModule, { logger: false });
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the safe stable contract over a real HTTP request', async () => {
    const response = await fetch(`${await app.getUrl()}/error-contract/validation`);
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toMatchObject({
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'INVALID_REQUEST',
      message: 'The request is invalid.',
    });
    expect(Object.keys(body).sort()).toEqual(['code', 'message', 'statusCode', 'timestamp']);
    expect(JSON.stringify(body)).not.toContain('email must be valid');
    expect(JSON.stringify(body)).not.toContain('must-not-leak');
  });

  it('preserves the allowlisted domain code over HTTP', async () => {
    const response = await fetch(`${await app.getUrl()}/error-contract/conversion-expired`);
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(HttpStatus.GONE);
    expect(body).toMatchObject({
      statusCode: HttpStatus.GONE,
      code: 'CONVERSION_RECOVERY_EXPIRED',
      message: 'The requested resource is no longer available.',
    });
    expect(JSON.stringify(body)).not.toContain('Conversion recovery window has expired');
  });
});
