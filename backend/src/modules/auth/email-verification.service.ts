import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrincipalType, UserStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { EmailDeliveryService } from './email-delivery.service';

type DeliveryStatus = 'SENT' | 'NOT_CONFIGURED' | 'FAILED';
type RateEntry = { count: number; resetAt: number };

@Injectable()
export class EmailVerificationService {
  private readonly resendAttempts = new Map<string, RateEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly delivery: EmailDeliveryService,
  ) {}

  async issueAndSend(userId: string): Promise<DeliveryStatus> {
    if (!this.delivery.isConfigured()) return 'NOT_CONFIGURED';
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerifiedAt: true, status: true },
    });
    if (!user || !user.email || user.status !== UserStatus.ACTIVE) return 'FAILED';
    if (user.emailVerifiedAt) return 'SENT';
    return this.createAndSend(user.id, user.email);
  }

  async resend(principal: AuthenticatedPrincipal) {
    if (principal.principalType !== PrincipalType.USER) throw new ForbiddenException('Registered account required');
    this.enforceResendLimit(principal.principalId);
    const user = await this.prisma.user.findUnique({
      where: { id: principal.principalId },
      select: { id: true, email: true, emailVerifiedAt: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE || !user.email || user.emailVerifiedAt) return { accepted: true };
    return { accepted: true, delivery: await this.issueAndSend(user.id) };
  }

  async verify(token: string) {
    const now = new Date();
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { user: true },
    });
    if (!record || record.consumedAt || record.expiresAt <= now ||
        record.user.status !== UserStatus.ACTIVE || !record.user.email) {
      throw new BadRequestException('Invalid or expired email verification token');
    }

    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: record.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw new BadRequestException('Invalid or expired email verification token');
      const updated = await tx.user.updateMany({
        where: { id: record.userId, status: UserStatus.ACTIVE, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      if (updated.count !== 1) throw new BadRequestException('Email verification could not be completed');
      await tx.emailVerificationToken.updateMany({
        where: { userId: record.userId, consumedAt: null }, data: { consumedAt: now },
      });
      await tx.identityAuditEvent.create({
        data: { eventType: 'EMAIL_VERIFIED', principalType: PrincipalType.USER, principalId: record.userId, result: 'SUCCESS' },
      });
    }, { isolationLevel: 'Serializable' });
    return { verified: true };
  }

  private async createAndSend(userId: string, email: string): Promise<DeliveryStatus> {
    const rawToken = randomBytes(32).toString('base64url');
    const now = new Date();
    const ttl = this.positiveInteger('EMAIL_VERIFICATION_TOKEN_TTL_SECONDS', 86400);
    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: { userId, consumedAt: null }, data: { consumedAt: now },
      });
      await tx.emailVerificationToken.create({
        data: { userId, tokenHash: this.hashToken(rawToken), expiresAt: new Date(now.getTime() + ttl * 1000) },
      });
      await tx.identityAuditEvent.create({
        data: { eventType: 'EMAIL_VERIFICATION_ISSUED', principalType: PrincipalType.USER, principalId: userId, result: 'SUCCESS' },
      });
    });
    try {
      await this.delivery.sendVerificationEmail(email, rawToken);
      return 'SENT';
    } catch {
      await this.writeDeliveryFailureAudit(userId);
      return 'FAILED';
    }
  }

  private enforceResendLimit(userId: string): void {
    const max = this.positiveInteger('EMAIL_VERIFICATION_RESEND_MAX_ATTEMPTS', 3);
    const windowSeconds = this.positiveInteger('EMAIL_VERIFICATION_RESEND_WINDOW_SECONDS', 3600);
    const now = Date.now();
    const current = this.resendAttempts.get(userId);
    if (this.resendAttempts.size > 10000) {
      for (const [key, entry] of this.resendAttempts) if (entry.resetAt <= now) this.resendAttempts.delete(key);
    }
    if (!current || current.resetAt <= now) {
      this.resendAttempts.set(userId, { count: 1, resetAt: now + windowSeconds * 1000 });
      return;
    }
    if (current.count >= max) throw new HttpException('Too many verification email requests', HttpStatus.TOO_MANY_REQUESTS);
    current.count += 1;
  }

  private async writeDeliveryFailureAudit(userId: string): Promise<void> {
    try {
      await this.prisma.identityAuditEvent.create({
        data: { eventType: 'EMAIL_VERIFICATION_DELIVERY_FAILED', principalType: PrincipalType.USER, principalId: userId, result: 'FAILURE' },
      });
    } catch { /* Preserve delivery result if audit storage is unavailable. */ }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private positiveInteger(key: string, fallback: number): number {
    const raw = this.config.get<string>(key);
    const value = raw === undefined || raw === '' ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`);
    return value;
  }
}
