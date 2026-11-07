import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuestIdentityStatus, PrincipalType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../session/session.service';

@Injectable()
export class GuestIdentityService {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
  ) {}

  async start(clientKey: string) {
    this.enforceStartLimit(clientKey);
    return this.prisma.$transaction(async (tx) => {
      const guest = await tx.guestIdentity.create({
        data: { status: GuestIdentityStatus.ACTIVE },
      });
      const credentials = await this.sessions.createSessionInTransaction(tx, {
        principalType: PrincipalType.GUEST,
        principalId: guest.id,
      });
      await tx.identityAuditEvent.create({
        data: {
          eventType: 'GUEST_IDENTITY_CREATED',
          principalType: PrincipalType.GUEST,
          principalId: guest.id,
          sessionId: credentials.session.sessionId,
          result: 'SUCCESS',
        },
      });
      return credentials;
    });
  }

  private enforceStartLimit(clientKey: string): void {
    const max = Number(this.config.get<string>('GUEST_START_MAX_ATTEMPTS', '10'));
    const windowMs = Number(this.config.get<string>('GUEST_START_WINDOW_SECONDS', '60')) * 1000;
    if (!Number.isSafeInteger(max) || max < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1000) {
      throw new Error('Invalid guest start rate-limit configuration');
    }
    const now = Date.now();
    const current = this.attempts.get(clientKey);
    if (this.attempts.size >= 10000) {
      for (const [key, value] of this.attempts) {
        if (value.resetAt <= now) this.attempts.delete(key);
      }
      if (this.attempts.size >= 10000 && !this.attempts.has(clientKey)) {
        throw new HttpException('Guest start limiter is at capacity', HttpStatus.TOO_MANY_REQUESTS);
      }
    }
    if (!current || current.resetAt <= now) {
      this.attempts.set(clientKey, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (current.count >= max) throw new HttpException('Guest start rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    current.count += 1;
  }
}
