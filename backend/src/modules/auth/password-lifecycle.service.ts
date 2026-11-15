import { ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrincipalType, Prisma, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { EmailDeliveryService } from './email-delivery.service';

type RateEntry = { count: number; resetAt: number };

@Injectable()
export class PasswordLifecycleService {
  private readonly attempts = new Map<string, RateEntry>();
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly delivery: EmailDeliveryService) {}

  async requestReset(emailInput: string, ipAddress: string): Promise<{ accepted: true }> {
    const email = emailInput.trim().toLowerCase();
    this.enforceLimit(`${ipAddress || 'unknown'}:${this.hash(email)}`);
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, email: true, status: true } });
    if (!user || user.status !== UserStatus.ACTIVE || !user.email || !this.delivery.isPasswordResetConfigured()) return { accepted: true };
    const rawToken = randomBytes(32).toString('base64url');
    const now = new Date();
    const ttl = this.positiveInteger('PASSWORD_RESET_TOKEN_TTL_SECONDS', 1800);
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: now } });
      await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash: this.hash(rawToken), expiresAt: new Date(now.getTime() + ttl * 1000) } });
      await tx.identityAuditEvent.create({ data: { eventType: 'PASSWORD_RESET_REQUESTED', principalType: PrincipalType.USER, principalId: user.id, result: 'SUCCESS' } });
    });
    try { await this.delivery.sendPasswordResetEmail(user.email, rawToken); }
    catch { await this.auditDeliveryFailure(user.id); }
    return { accepted: true };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: true; sessionsRevoked: number }> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException('Invalid or expired password reset token');
    const now = new Date();
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: this.hash(token) }, include: { user: true } });
    if (!record || record.consumedAt || record.expiresAt <= now || record.user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Invalid or expired password reset token');
    const passwordHash = await this.hashPassword(newPassword);
    return this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({ where: { id: record.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
      if (consumed.count !== 1) throw new UnauthorizedException('Invalid or expired password reset token');
      const active = await tx.user.updateMany({ where: { id: record.userId, status: UserStatus.ACTIVE }, data: { updatedAt: now } });
      if (active.count !== 1) throw new UnauthorizedException('Invalid or expired password reset token');
      await tx.accountCredential.upsert({ where: { userId: record.userId }, create: { userId: record.userId, passwordHash, passwordChangedAt: now }, update: { passwordHash, passwordChangedAt: now } });
      const sessions = await tx.userSession.findMany({ where: { userId: record.userId, revokedAt: null }, select: { id: true } });
      const ids = sessions.map((s) => s.id);
      const revoked = await tx.userSession.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: now } });
      if (ids.length) await tx.refreshToken.updateMany({ where: { sessionId: { in: ids }, revokedAt: null }, data: { revokedAt: now, retryResponseCiphertext: null, retryResponseExpiresAt: null } });
      await tx.passwordResetToken.updateMany({ where: { userId: record.userId, consumedAt: null }, data: { consumedAt: now } });
      await tx.identityAuditEvent.create({ data: { eventType: 'PASSWORD_RESET_COMPLETED', principalType: PrincipalType.USER, principalId: record.userId, result: 'SUCCESS', metadata: { revokedSessions: revoked.count } } });
      return { success: true as const, sessionsRevoked: revoked.count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async changePassword(principal: AuthenticatedPrincipal, currentPassword: string, newPassword: string): Promise<{ success: true; sessionsRevoked: number }> {
    if (principal.principalType !== PrincipalType.USER) throw new ForbiddenException('Registered account required');
    const user = await this.prisma.user.findFirst({ where: { id: principal.principalId, status: UserStatus.ACTIVE }, select: { credential: { select: { id: true, passwordHash: true } } } });
    if (!user?.credential) throw new UnauthorizedException('Password credential is not configured; use verified email recovery');
    let valid = false;
    try { valid = await argon2.verify(user.credential.passwordHash, currentPassword); } catch { valid = false; }
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    const passwordHash = await this.hashPassword(newPassword);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.accountCredential.updateMany({ where: { id: user.credential!.id, passwordHash: user.credential!.passwordHash }, data: { passwordHash, passwordChangedAt: now } });
      if (updated.count !== 1) throw new UnauthorizedException('Password changed concurrently; retry');
      const others = await tx.userSession.findMany({ where: { userId: principal.principalId, id: { not: principal.sessionId }, revokedAt: null }, select: { id: true } });
      const ids = others.map((s) => s.id);
      const revoked = await tx.userSession.updateMany({ where: { userId: principal.principalId, id: { not: principal.sessionId }, revokedAt: null }, data: { revokedAt: now } });
      if (ids.length) await tx.refreshToken.updateMany({ where: { sessionId: { in: ids }, revokedAt: null }, data: { revokedAt: now, retryResponseCiphertext: null, retryResponseExpiresAt: null } });
      await tx.identityAuditEvent.create({ data: { eventType: 'PASSWORD_CHANGED', principalType: PrincipalType.USER, principalId: principal.principalId, sessionId: principal.sessionId, result: 'SUCCESS', metadata: { revokedSessions: revoked.count } } });
      return { success: true as const, sessionsRevoked: revoked.count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id, memoryCost: this.positiveInteger('ARGON2_MEMORY_COST_KIB', 19456), timeCost: this.positiveInteger('ARGON2_TIME_COST', 2), parallelism: this.positiveInteger('ARGON2_PARALLELISM', 1) });
  }
  private enforceLimit(key: string): void {
    const max = this.positiveInteger('PASSWORD_RESET_MAX_ATTEMPTS', 5);
    const seconds = this.positiveInteger('PASSWORD_RESET_WINDOW_SECONDS', 3600);
    const now = Date.now(); const id = `password-reset:${key}`; const entry = this.attempts.get(id);
    if (this.attempts.size > 10000) for (const [k, v] of this.attempts) if (v.resetAt <= now) this.attempts.delete(k);
    if (!entry || entry.resetAt <= now) { this.attempts.set(id, { count: 1, resetAt: now + seconds * 1000 }); return; }
    if (entry.count >= max) throw new HttpException('Too many password reset requests', HttpStatus.TOO_MANY_REQUESTS);
    entry.count++;
  }
  private async auditDeliveryFailure(userId: string): Promise<void> {
    try { await this.prisma.identityAuditEvent.create({ data: { eventType: 'PASSWORD_RESET_DELIVERY_FAILED', principalType: PrincipalType.USER, principalId: userId, result: 'FAILURE' } }); }
    catch { /* Keep account existence and delivery state private. */ }
  }
  private hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
  private positiveInteger(key: string, fallback: number): number {
    const raw = this.config.get<string>(key); const value = raw === undefined || raw === '' ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`);
    return value;
  }
}
