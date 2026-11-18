import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication, ExecutionContext } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { GuestIdentityController } from './guest-identity.controller';
import { GuestIdentityService } from './guest-identity.service';
import { AccessTokenGuard } from '../identity/access-token.guard';
import type { AuthenticatedPrincipal } from '../identity/authenticated-principal';

describe('GuestIdentityController HTTP contract', () => {
  let app: INestApplication;
  let baseUrl: string;
  const principal: AuthenticatedPrincipal = {
    principalType: 'GUEST',
    principalId: 'guest-http-test',
    sessionId: 'guest-session-http-test',
  };
  const guests = {
    start: jest.fn().mockResolvedValue({ started: true }),
    convert: jest.fn().mockResolvedValue({ converted: true }),
    retryConversion: jest.fn().mockResolvedValue({ recovered: true }),
  };
  const guard = {
    canActivate: jest.fn((context: ExecutionContext) => {
      context.switchToHttp().getRequest().principal = principal;
      return true;
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GuestIdentityController],
      providers: [
        { provide: GuestIdentityService, useValue: guests },
        { provide: AccessTokenGuard, useValue: guard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    jest.clearAllMocks();
    guests.convert.mockResolvedValue({ converted: true });
    guests.retryConversion.mockResolvedValue({ recovered: true });
  });

  it('accepts the initial conversion DTO and forwards the idempotency header under guest auth', async () => {
    const body = {
      refreshToken: 'r'.repeat(43), email: 'player@example.test',
      password: 'a-long-password-123', username: 'player_01', displayName: 'Player One',
    };
    const response = await fetch(`${baseUrl}/api/v1/guest/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer guest-access', 'Idempotency-Key': 'i'.repeat(43) },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ converted: true });
    expect(guard.canActivate).toHaveBeenCalledTimes(1);
    expect(guests.convert).toHaveBeenCalledWith(principal, body, 'i'.repeat(43), expect.any(String));
  });

  it('exposes recovery without AccessTokenGuard and forwards both proofs', async () => {
    const response = await fetch(`${baseUrl}/api/v1/guest/convert/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'i'.repeat(43) },
      body: JSON.stringify({ refreshToken: 'r'.repeat(43) }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ recovered: true });
    expect(guard.canActivate).not.toHaveBeenCalled();
    expect(guests.retryConversion).toHaveBeenCalledWith('r'.repeat(43), 'i'.repeat(43), expect.any(String));
  });
});
