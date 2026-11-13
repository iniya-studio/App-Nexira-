import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrincipalType } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenService } from '../identity/access-token.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';

type SessionOwner = { principalType: PrincipalType; principalId: string };
type TokenResponse = {
  principal: { principalType: PrincipalType; principalId: string };
  session: { sessionId: string; expiresAt: string };
  tokens: { accessToken: string; accessTokenExpiresAt: string; refreshToken: string; refreshTokenExpiresAt: string };
};

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly accessTokens: AccessTokenService,
  ) {}

  async createSessionInTransaction(tx: Prisma.TransactionClient, owner: SessionOwner): Promise<TokenResponse> {
    const now = new Date();
    const sessionExpiresAt = new Date(now.getTime() + this.seconds('SESSION_ABSOLUTE_TTL_SECONDS') * 1000);
    const refreshExpiresAt = new Date(Math.min(
      now.getTime() + this.seconds('REFRESH_TOKEN_TTL_SECONDS') * 1000,
      sessionExpiresAt.getTime(),
    ));
    const session = await tx.userSession.create({
      data: owner.principalType === PrincipalType.USER
        ? { userId: owner.principalId, expiresAt: sessionExpiresAt }
        : { guestIdentityId: owner.principalId, expiresAt: sessionExpiresAt },
    });
    return this.issueInitialCredentials(tx, owner, session.id, sessionExpiresAt, refreshExpiresAt);
  }

  private async issueInitialCredentials(
    tx: Prisma.TransactionClient,
    owner: SessionOwner,
    sessionId: string,
    sessionExpiresAt: Date,
    refreshExpiresAt: Date,
  ): Promise<TokenResponse> {
    const rawRefreshToken = randomBytes(32).toString('base64url');
    await tx.refreshToken.create({
      data: {
        sessionId,
        tokenHash: this.hash(rawRefreshToken),
        expiresAt: refreshExpiresAt,
        idempotencyKeyHash: this.hash(randomUUID()),
      },
    });
    const access = this.accessTokens.issue({ ...owner, sessionId });
    return {
      principal: owner,
      session: { sessionId, expiresAt: sessionExpiresAt.toISOString() },
      tokens: {
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt.toISOString(),
        refreshToken: rawRefreshToken,
        refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
      },
    };
  }

  async refresh(rawToken: string, idempotencyKey: string): Promise<TokenResponse> {
    const highEntropyTokenPattern = /^[A-Za-z0-9_-]{43,128}$/;
    if (!highEntropyTokenPattern.test(rawToken) || !highEntropyTokenPattern.test(idempotencyKey)) {
      throw new UnauthorizedException('Invalid refresh credentials');
    }
    const tokenHash = this.hash(rawToken);
    const keyHash = this.hash(idempotencyKey);
    const outcome = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.refreshToken.updateMany({
        where: { retryResponseExpiresAt: { lte: now }, retryResponseCiphertext: { not: null } },
        data: { retryResponseCiphertext: null, retryResponseExpiresAt: null },
      });
      const current = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: { session: { include: { user: true, guestIdentity: true } } },
      });
      if (!current) throw new UnauthorizedException('Invalid refresh credentials');
      const session = current.session;
      const owner: SessionOwner | null = session.userId && session.user?.status === 'ACTIVE'
        ? { principalType: PrincipalType.USER, principalId: session.userId }
        : session.guestIdentityId && session.guestIdentity?.status === 'ACTIVE'
          ? { principalType: PrincipalType.GUEST, principalId: session.guestIdentityId }
          : null;
      if (!owner || session.revokedAt || session.expiresAt <= now) throw new UnauthorizedException('Session is not active');

      if (current.consumedAt) {
        if (
          current.idempotencyKeyHash === keyHash &&
          current.retryResponseCiphertext &&
          current.retryResponseExpiresAt &&
          current.retryResponseExpiresAt > now
        ) return { replayDetected: false as const, response: this.decryptResponse(current.retryResponseCiphertext) };
        await tx.userSession.update({ where: { id: session.id }, data: { revokedAt: now } });
        await tx.refreshToken.updateMany({
          where: { sessionId: session.id, revokedAt: null },
          data: { revokedAt: now, retryResponseCiphertext: null, retryResponseExpiresAt: null },
        });
        await tx.identityAuditEvent.create({
          data: {
            eventType: 'REFRESH_TOKEN_REUSE_DETECTED',
            principalType: owner.principalType,
            principalId: owner.principalId,
            sessionId: session.id,
            result: 'FAILURE',
          },
        });
        return { replayDetected: true as const };
      }

      if (current.revokedAt || current.expiresAt <= now) throw new UnauthorizedException('Refresh token is not active');
      const nextRawToken = randomBytes(32).toString('base64url');
      const nextRefreshExpiresAt = new Date(Math.min(
        now.getTime() + this.seconds('REFRESH_TOKEN_TTL_SECONDS') * 1000,
        session.expiresAt.getTime(),
      ));
      const access = this.accessTokens.issue({ ...owner, sessionId: session.id });
      const response: TokenResponse = {
        principal: owner,
        session: { sessionId: session.id, expiresAt: session.expiresAt.toISOString() },
        tokens: {
          accessToken: access.token,
          accessTokenExpiresAt: access.expiresAt.toISOString(),
          refreshToken: nextRawToken,
          refreshTokenExpiresAt: nextRefreshExpiresAt.toISOString(),
        },
      };
      const retryExpiresAt = new Date(now.getTime() + this.seconds('REFRESH_RETRY_WINDOW_SECONDS') * 1000);
      const successor = await tx.refreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash: this.hash(nextRawToken),
          expiresAt: nextRefreshExpiresAt,
          idempotencyKeyHash: this.hash(randomUUID()),
        },
      });
      const consumed = await tx.refreshToken.updateMany({
        where: { id: current.id, consumedAt: null, revokedAt: null },
        data: {
          consumedAt: now,
          idempotencyKeyHash: keyHash,
          replacedByTokenId: successor.id,
          retryResponseCiphertext: this.encryptResponse(response),
          retryResponseExpiresAt: retryExpiresAt,
        },
      });
      if (consumed.count !== 1) throw new UnauthorizedException('Refresh operation conflicted');
      await tx.identityAuditEvent.create({
        data: {
          eventType: 'REFRESH_TOKEN_ROTATED',
          principalType: owner.principalType,
          principalId: owner.principalId,
          sessionId: session.id,
          result: 'SUCCESS',
        },
      });
      return { replayDetected: false as const, response };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (outcome.replayDetected) throw new UnauthorizedException('Refresh token reuse detected');
    return outcome.response;
  }

  async logout(principal: AuthenticatedPrincipal): Promise<{ success: true }> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.userSession.updateMany({
        where: {
          id: principal.sessionId,
          revokedAt: null,
          ...(principal.principalType === PrincipalType.USER
            ? { userId: principal.principalId }
            : { guestIdentityId: principal.principalId }),
        },
        data: { revokedAt: now },
      });
      await tx.refreshToken.updateMany({
        where: { sessionId: principal.sessionId, revokedAt: null },
        data: { revokedAt: now, retryResponseCiphertext: null, retryResponseExpiresAt: null },
      });
      await tx.identityAuditEvent.create({
        data: {
          eventType: 'SESSION_LOGOUT',
          principalType: principal.principalType,
          principalId: principal.principalId,
          sessionId: principal.sessionId,
          result: 'SUCCESS',
        },
      });
    });
    return { success: true };
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private seconds(key: string): number {
    const value = Number(this.config.getOrThrow<string>(key));
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`);
    return value;
  }

  private encryptionKey(): Buffer {
    const key = Buffer.from(this.config.getOrThrow<string>('REFRESH_RETRY_ENCRYPTION_KEY'), 'base64');
    if (key.length !== 32) throw new Error('REFRESH_RETRY_ENCRYPTION_KEY must decode to exactly 32 bytes');
    return key;
  }

  private encryptResponse(response: TokenResponse): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(response), 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }

  private decryptResponse(value: string): TokenResponse {
    try {
      const [ivPart, tagPart, dataPart] = value.split('.');
      const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(ivPart, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
      const clear = Buffer.concat([
        decipher.update(Buffer.from(dataPart, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
      return JSON.parse(clear) as TokenResponse;
    } catch {
      throw new UnauthorizedException('Refresh retry is unavailable');
    }
  }
}
