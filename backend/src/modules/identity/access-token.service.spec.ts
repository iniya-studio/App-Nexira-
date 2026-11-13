import { ConfigService } from '@nestjs/config';
import { PrincipalType } from '@prisma/client';
import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  const config = {
    getOrThrow: (key: string) => ({
      JWT_SECRET: Buffer.alloc(32, 7).toString('base64'),
      JWT_ISSUER: 'https://test.nexira',
      JWT_AUDIENCE: 'nexira-test',
      ACCESS_TOKEN_TTL_SECONDS: '900',
    })[key],
  } as unknown as ConfigService;

  it('issues and verifies a signed guest access token', () => {
    const service = new AccessTokenService(config);
    const issued = service.issue({
      principalType: PrincipalType.GUEST,
      principalId: 'guest-123',
      sessionId: 'session-456',
    });
    const claims = service.verify(issued.token);
    expect(claims.sub).toBe('guest-123');
    expect(claims.sid).toBe('session-456');
    expect(claims.principalType).toBe(PrincipalType.GUEST);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects a token with a modified signature', () => {
    const service = new AccessTokenService(config);
    const issued = service.issue({
      principalType: PrincipalType.USER,
      principalId: 'user-123',
      sessionId: 'session-456',
    });
    const [header, payload] = issued.token.split('.');
    expect(() => service.verify(`${header}.${payload}.invalid`)).toThrow();
  });
});
