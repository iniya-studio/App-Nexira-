import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { ApiExceptionFilter, ApiErrorResponse } from './api-exception.filter';

function createHost() {
  const result: { status?: number; body?: ApiErrorResponse } = {};
  const response = {
    status(code: number) {
      result.status = code;
      return { json(body: ApiErrorResponse) { result.body = body; } };
    },
  };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, result };
}

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();

  it.each([
    [HttpStatus.BAD_REQUEST, 'INVALID_REQUEST'],
    [HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED'],
    [HttpStatus.FORBIDDEN, 'FORBIDDEN'],
    [HttpStatus.NOT_FOUND, 'NOT_FOUND'],
    [HttpStatus.CONFLICT, 'CONFLICT'],
    [HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED'],
  ] as const)('maps HTTP %i to stable code %s', (status, code) => {
    const { host, result } = createHost();
    filter.catch(new HttpException('private internal detail', status), host);
    expect(result.status).toBe(status);
    expect(result.body).toMatchObject({ statusCode: status, code });
    expect(result.body?.message).not.toContain('private internal detail');
    expect(result.body?.timestamp).toEqual(expect.any(String));
  });

  it('preserves allowlisted domain codes without exposing their custom messages', () => {
    const { host, result } = createHost();
    filter.catch(new HttpException({
      code: 'CONVERSION_RECOVERY_EXPIRED',
      message: 'Conversion recovery window has expired',
    }, HttpStatus.GONE), host);
    expect(result.body).toMatchObject({
      statusCode: HttpStatus.GONE,
      code: 'CONVERSION_RECOVERY_EXPIRED',
      message: 'The requested resource is no longer available.',
    });
    expect(JSON.stringify(result.body)).not.toContain('Conversion recovery window has expired');
  });

  it('does not trust arbitrary exception response codes', () => {
    const { host, result } = createHost();
    filter.catch(new HttpException({
      code: 'DATABASE_PASSWORD',
      message: 'private detail',
    }, HttpStatus.CONFLICT), host);
    expect(result.body?.code).toBe('CONFLICT');
    expect(JSON.stringify(result.body)).not.toContain('DATABASE_PASSWORD');
  });

  it('normalizes unknown exceptions to a safe generic 500 response', () => {
    const { host, result } = createHost();
    filter.catch(new Error('database password leaked in exception'), host);
    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body).toMatchObject({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected server error occurred.',
    });
    expect(JSON.stringify(result.body)).not.toContain('database password');
  });

  it('does not expose validation details or custom exception response bodies', () => {
    const { host, result } = createHost();
    filter.catch(new HttpException({
      statusCode: HttpStatus.BAD_REQUEST,
      message: ['email must be valid', 'password must be strong'],
      error: 'Bad Request',
      secret: 'internal-diagnostic',
    }, HttpStatus.BAD_REQUEST), host);
    expect(result.body).toMatchObject({
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'INVALID_REQUEST',
      message: 'The request is invalid.',
    });
    expect(JSON.stringify(result.body)).not.toContain('email must be valid');
    expect(JSON.stringify(result.body)).not.toContain('internal-diagnostic');
  });
});
