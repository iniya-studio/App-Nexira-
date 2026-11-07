import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityProvider, PrincipalType, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../session/session.service';
import { GoogleIdentityVerifier } from './google-identity-verifier';
import { RegisterDto } from './dto/register.dto';
import { EmailVerificationService } from './email-verification.service';

type RateEntry = { count: number; resetAt: number };

@Injectable()
export class AuthService {
  private readonly attempts = new Map<string, RateEntry>();
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
    private readonly google: GoogleIdentityVerifier,
    private readonly emailVerification: EmailVerificationService,
  ) {
    this.dummyHash = this.hashPassword('NEXIRA_DUMMY_PASSWORD_DO_NOT_USE');
  }

  async register(input: RegisterDto, ipAddress: string) {
    const email = this.normalizeEmail(input.email);
    const username = input.username.trim().toLowerCase();
    const displayName = input.displayName.trim();
    this.enforceLimit('register', ipAddress || 'unknown');

    const passwordHash = await this.hashPassword(input.password);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            username,
            displayName,
            status: UserStatus.ACTIVE,
            credential: { create: { passwordHash } },
          },
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            preferredLanguage: true,
            emailVerifiedAt: true,
          },
        });
        const session = await this.sessions.createSessionInTransaction(tx, {
          principalType: PrincipalType.USER,
          principalId: user.id,
        });
        await tx.identityAuditEvent.create({
          data: {
            eventType: 'USER_REGISTERED_EMAIL',
            principalType: PrincipalType.USER,
            principalId: user.id,
            sessionId: session.session.sessionId,
            result: 'SUCCESS',
          },
        });
        return { user, ...session };
      });
      const delivery = await this.emailVerification.issueAndSend(created.user.id);
      return { ...created, emailVerification: { required: true, verified: false, delivery } };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('An account with this email or username already exists');
      }
      throw error;
    }
  }

  async login(input: { email: string; password: string }, ipAddress: string) {
    const email = this.normalizeEmail(input.email);
    const rateKey = `${ipAddress || 'unknown'}:${email}`;
    this.enforceLimit('login', rateKey);

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { credential: true },
    });
    const hash = user?.credential?.passwordHash ?? await this.dummyHash;
    let passwordMatches = false;
    try {
      passwordMatches = await argon2.verify(hash, input.password);
    } catch {
      passwordMatches = false;
    }

    if (!user || !user.credential || user.status !== UserStatus.ACTIVE || !passwordMatches) {
      await this.auditLoginFailure();
      throw new UnauthorizedException('Invalid email or password');
    }

    this.attempts.delete(`login:${rateKey}`);
    return this.prisma.$transaction(async (tx) => {
      const session = await this.sessions.createSessionInTransaction(tx, {
        principalType: PrincipalType.USER,
        principalId: user.id,
      });
      await tx.identityAuditEvent.create({
        data: {
          eventType: 'USER_LOGIN_EMAIL',
          principalType: PrincipalType.USER,
          principalId: user.id,
          sessionId: session.session.sessionId,
          result: 'SUCCESS',
        },
      });
      return {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          preferredLanguage: user.preferredLanguage,
          emailVerifiedAt: user.emailVerifiedAt,
        },
        ...session,
      };
    });
  }

  async googleSignIn(idToken: string, ipAddress: string) {
    this.enforceLimit('google', ipAddress || 'unknown');
    const claims = await this.google.verify(idToken);
    const providerSubject = claims.sub;
    const email = this.normalizeEmail(claims.email!);

    const linked = await this.prisma.externalIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: IdentityProvider.GOOGLE,
          providerSubject,
        },
      },
      include: { user: true },
    });

    if (linked) {
      if (linked.user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('This account is not available');
      }
      return this.prisma.$transaction(async (tx) => {
        const session = await this.sessions.createSessionInTransaction(tx, {
          principalType: PrincipalType.USER,
          principalId: linked.user.id,
        });
        await tx.identityAuditEvent.create({
          data: {
            eventType: 'USER_LOGIN_GOOGLE',
            principalType: PrincipalType.USER,
            principalId: linked.user.id,
            sessionId: session.session.sessionId,
            result: 'SUCCESS',
          },
        });
        return {
          user: {
            id: linked.user.id,
            email: linked.user.email,
            username: linked.user.username,
            displayName: linked.user.displayName,
            preferredLanguage: linked.user.preferredLanguage,
            emailVerifiedAt: linked.user.emailVerifiedAt,
          },
          ...session,
        };
      });
    }

    const existingEmail = await this.prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      throw new ConflictException(
        'An account with this email already exists. Sign in to that account before linking Google.',
      );
    }

    const username = await this.generateAvailableUsername(email);
    const displayName = claims.name?.trim().slice(0, 40) || username;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            username,
            displayName,
            status: UserStatus.ACTIVE,
            emailVerifiedAt: new Date(),
            externalIdentities: {
              create: {
                provider: IdentityProvider.GOOGLE,
                providerSubject,
                providerEmail: email,
                emailVerified: true,
              },
            },
          },
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            preferredLanguage: true,
            emailVerifiedAt: true,
          },
        });
        const session = await this.sessions.createSessionInTransaction(tx, {
          principalType: PrincipalType.USER,
          principalId: user.id,
        });
        await tx.identityAuditEvent.create({
          data: {
            eventType: 'USER_REGISTERED_GOOGLE',
            principalType: PrincipalType.USER,
            principalId: user.id,
            sessionId: session.session.sessionId,
            result: 'SUCCESS',
          },
        });
        return { user, ...session };
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Google identity or account already exists; retry sign-in');
      }
      throw error;
    }
  }

  private async hashPassword(password: string): Promise<string> {
    const memoryCost = this.positiveInteger('ARGON2_MEMORY_COST_KIB', 19456);
    const timeCost = this.positiveInteger('ARGON2_TIME_COST', 2);
    const parallelism = this.positiveInteger('ARGON2_PARALLELISM', 1);
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost,
      timeCost,
      parallelism,
    });
  }

  private positiveInteger(key: string, fallback: number): number {
    const raw = this.config.get<string>(key);
    const value = raw === undefined || raw === '' ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${key} must be a positive integer`);
    }
    return value;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private enforceLimit(kind: 'login' | 'google' | 'register', key: string): void {
    const isRegister = kind === 'register';
    const max = this.positiveInteger(
      isRegister ? 'AUTH_REGISTER_MAX_ATTEMPTS' : 'AUTH_LOGIN_MAX_ATTEMPTS',
      isRegister ? 5 : 10,
    );
    const windowSeconds = this.positiveInteger(
      isRegister ? 'AUTH_REGISTER_WINDOW_SECONDS' : 'AUTH_LOGIN_WINDOW_SECONDS',
      isRegister ? 3600 : 900,
    );
    const mapKey = `${kind}:${key}`;
    const now = Date.now();
    const current = this.attempts.get(mapKey);
    if (this.attempts.size > 10000) {
      for (const [entryKey, entry] of this.attempts) {
        if (entry.resetAt <= now) this.attempts.delete(entryKey);
      }
    }
    if (!current || current.resetAt <= now) {
      this.attempts.set(mapKey, { count: 1, resetAt: now + windowSeconds * 1000 });
      return;
    }
    if (current.count >= max) {
      throw new HttpException('Too many authentication attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
    current.count += 1;
  }

  private async generateAvailableUsername(email: string): Promise<string> {
    const base = (email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 12) || 'player')
      .padEnd(3, 'x');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `${base}_${randomBytes(3).toString('hex')}`;
      const exists = await this.prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
      if (!exists) return candidate;
    }
    throw new ConflictException('Could not allocate a username; retry sign-in');
  }

  private async auditLoginFailure(): Promise<void> {
    try {
      await this.prisma.identityAuditEvent.create({
        data: { eventType: 'USER_LOGIN_FAILURE', result: 'FAILURE' },
      });
    } catch {
      // Authentication failure must remain generic even if audit storage is temporarily unavailable.
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}