import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrincipalType } from '@prisma/client';
import { AccessTokenClaims } from './authenticated-principal';

@Injectable()
export class AccessTokenService {
  constructor(private readonly config: ConfigService) {}

  issue(principal: { principalType: PrincipalType; principalId: string; sessionId: string }): {
    token: string;
    expiresAt: Date;
  } {
    const now = Math.floor(Date.now() / 1000);
    const ttl = this.requiredPositiveInteger('ACCESS_TOKEN_TTL_SECONDS');
    const claims: AccessTokenClaims = {
      iss: this.config.getOrThrow<string>('JWT_ISSUER'),
      aud: this.config.getOrThrow<string>('JWT_AUDIENCE'),
      sub: principal.principalId,
      principalType: principal.principalType,
      sid: principal.sessionId,
      jti: randomUUID(),
      iat: now,
      exp: now + ttl,
    };
    const header = this.encode({ alg: 'HS256', typ: 'JWT' });
    const payload = this.encode(claims);
    const input = `${header}.${payload}`;
    const signature = createHmac('sha256', this.secret()).update(input).digest('base64url');
    return { token: `${input}.${signature}`, expiresAt: new Date(claims.exp * 1000) };
  }

  verify(token: string): AccessTokenClaims {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Invalid access token');
    const [headerPart, payloadPart, signaturePart] = parts;
    try {
      const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as { alg?: string; typ?: string };
      if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error('Unsupported token header');
      const input = `${headerPart}.${payloadPart}`;
      const expected = createHmac('sha256', this.secret()).update(input).digest();
      const actual = Buffer.from(signaturePart, 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid signature');
      const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as AccessTokenClaims;
      const now = Math.floor(Date.now() / 1000);
      if (
        claims.iss !== this.config.getOrThrow<string>('JWT_ISSUER') ||
        claims.aud !== this.config.getOrThrow<string>('JWT_AUDIENCE') ||
        !claims.sub || !claims.sid || !claims.jti ||
        ![PrincipalType.USER, PrincipalType.GUEST].includes(claims.principalType) ||
        !Number.isInteger(claims.exp) || !Number.isInteger(claims.iat) ||
        claims.exp <= now || claims.iat > now + 30
      ) throw new Error('Invalid token claims');
      return claims;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private secret(): Buffer {
    const value = this.config.getOrThrow<string>('JWT_SECRET');
    const secret = Buffer.from(value, 'base64');
    if (secret.length < 32) throw new Error('JWT_SECRET must be base64-encoded and contain at least 32 bytes');
    return secret;
  }

  private requiredPositiveInteger(key: string): number {
    const value = Number(this.config.getOrThrow<string>(key));
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`);
    return value;
  }

  private encode(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }
}
