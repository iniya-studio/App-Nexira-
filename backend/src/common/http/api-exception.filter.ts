import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';

type HttpResponse = {
  status(code: number): { json(body: ApiErrorResponse): void };
};

export type ApiErrorResponse = {
  statusCode: number;
  code: string;
  message: string;
  timestamp: string;
};

type ApiErrorDefinition = {
  code: string;
  message: string;
};

const ERROR_BY_STATUS: Readonly<Record<number, ApiErrorDefinition>> = Object.freeze({
  [HttpStatus.BAD_REQUEST]: { code: 'INVALID_REQUEST', message: 'The request is invalid.' },
  [HttpStatus.UNAUTHORIZED]: { code: 'UNAUTHENTICATED', message: 'Authentication is required or is no longer valid.' },
  [HttpStatus.FORBIDDEN]: { code: 'FORBIDDEN', message: 'You are not allowed to perform this action.' },
  [HttpStatus.NOT_FOUND]: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
  [HttpStatus.CONFLICT]: { code: 'CONFLICT', message: 'The request conflicts with the current resource state.' },
  [HttpStatus.GONE]: { code: 'RESOURCE_EXPIRED', message: 'The requested resource is no longer available.' },
  [HttpStatus.UNPROCESSABLE_ENTITY]: { code: 'INVALID_REQUEST', message: 'The request is invalid.' },
  [HttpStatus.TOO_MANY_REQUESTS]: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
  [HttpStatus.PAYLOAD_TOO_LARGE]: { code: 'PAYLOAD_TOO_LARGE', message: 'The request payload is too large.' },
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'The request media type is not supported.' },
});

const EXPLICIT_ERROR_CODES_BY_STATUS: Readonly<Record<number, ReadonlySet<string>>> = Object.freeze({
  [HttpStatus.GONE]: new Set(['CONVERSION_RECOVERY_EXPIRED']),
  [HttpStatus.CONFLICT]: new Set(['CONVERSION_NOT_COMMITTED']),
});

function definitionForStatus(status: number, exception: unknown): ApiErrorDefinition {
  const known = ERROR_BY_STATUS[status];
  if (known) {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (body && typeof body === 'object' && 'code' in body && typeof body.code === 'string'
        && EXPLICIT_ERROR_CODES_BY_STATUS[status]?.has(body.code)) {
        return { ...known, code: body.code };
      }
    }
    return known;
  }
  if (status >= 500) return { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected server error occurred.' };
  return { code: 'REQUEST_FAILED', message: 'The request could not be completed.' };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): Observable<never> | void {
    if (host.getType() !== 'http') return throwError(() => exception);
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const definition = definitionForStatus(status, exception);

    response.status(status).json({
      statusCode: status,
      code: definition.code,
      message: definition.message,
      timestamp: new Date().toISOString(),
    });
  }
}
