import { ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../session/session.service';
import { ConfigService } from '@nestjs/config';
import { GoogleIdentityVerifier } from './google-identity-verifier';
import { EmailVerificationService } from './email-verification.service';

describe('AuthService', () => {
  const user = {
    id: 'user-1',
    email: 'player@example.com',
    username: 'player_one',
    displayName: 'Player One',
    preferredLanguage: 'en',
    emailVerifiedAt: null,
    status: 'ACTIVE',
    credential: { passwordHash: '' },
  };
  const sessionResponse = {
    principal: { principalType: 'USER', principalId: 'user-1' },
    session: { sessionId: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
    tokens: {
      accessToken: 'access',
      accessTokenExpiresAt: '2029-01-01T00:15:00.000Z',
      refreshToken: 'refresh',
      refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z',
    },
  };

  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock };
    externalIdentity: { findUnique: jest.Mock };
    $transaction: jest.Mock;
    identityAuditEvent: { create: jest.Mock };
  };
  let tx: {
    user: { create: jest.Mock };
    identityAuditEvent: { create: jest.Mock };
  };
  let sessions: { createSessionInTransaction: jest.Mock };
  let google: { verify: jest.Mock };
  let emailVerification: { issueAndSend: jest.Mock };

  beforeEach(() => {
    tx = {
      user: { create: jest.fn().mockResolvedValue({ ...user, credential: undefined }) },
      identityAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      user: { findUnique: jest.fn() },
      externalIdentity: { findUnique: jest.fn() },
      $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
      identityAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    sessions = { createSessionInTransaction: jest.fn().mockResolvedValue(sessionResponse) };
    google = { verify: jest.fn() };
    emailVerification = { issueAndSend: jest.fn().mockResolvedValue('NOT_CONFIGURED') };
    const config = {
      get: jest.fn((key: string) => ({
        ARGON2_MEMORY_COST_KIB: '1024',
        ARGON2_TIME_COST: '2',
        ARGON2_PARALLELISM: '1',
      })[key]),
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      sessions as unknown as SessionService,
      config as unknown as ConfigService,
      google as unknown as GoogleIdentityVerifier,
      emailVerification as unknown as EmailVerificationService,
    );
  });

  it('normalizes email and creates a credential and user session atomically', async () => {
    const result = await service.register({
      email: ' Player@Example.COM ',
      password: 'a-long-and-strong-password',
      username: 'Player_One',
      displayName: ' Player One ',
    }, '127.0.0.1');

    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: 'player@example.com',
        username: 'player_one',
        displayName: 'Player One',
        credential: { create: { passwordHash: expect.any(String) } },
      }),
    }));
    expect(sessions.createSessionInTransaction).toHaveBeenCalled();
    expect(result.emailVerification).toEqual({
      required: true,
      verified: false,
      delivery: 'NOT_CONFIGURED',
    });
  });

  it('rejects duplicate email or username without creating a session', async () => {
    prisma.$transaction.mockRejectedValue({ code: 'P2002' });
    await expect(service.register({
      email: 'player@example.com',
      password: 'a-long-and-strong-password',
      username: 'player_one',
      displayName: 'Player One',
    }, '127.0.0.1')).rejects.toBeInstanceOf(ConflictException);
    expect(sessions.createSessionInTransaction).not.toHaveBeenCalled();
  });

  it('authenticates a valid password and creates a user session', async () => {
    const passwordHash = await argon2.hash('correct-horse-battery-staple', {
      type: argon2.argon2id,
      memoryCost: 1024,
      timeCost: 2,
      parallelism: 1,
    });
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      credential: { passwordHash },
    });

    const result = await service.login({
      email: 'PLAYER@example.com',
      password: 'correct-horse-battery-staple',
    }, '127.0.0.1');

    expect(sessions.createSessionInTransaction).toHaveBeenCalled();
    expect(result.user.email).toBe('player@example.com');
  });

  it('returns the same generic failure for an unknown email and a bad password', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.login({
      email: 'missing@example.com',
      password: 'wrong-password',
    }, '127.0.0.1')).rejects.toThrow('Invalid email or password');
    expect(sessions.createSessionInTransaction).not.toHaveBeenCalled();
    expect(prisma.identityAuditEvent.create).toHaveBeenCalled();
  });

  it('rejects suspended accounts even when the password is correct', async () => {
    const passwordHash = await argon2.hash('correct-horse-battery-staple', {
      type: argon2.argon2id, memoryCost: 1024, timeCost: 2, parallelism: 1,
    });
    prisma.user.findUnique.mockResolvedValue({
      ...user, status: 'SUSPENDED', credential: { passwordHash },
    });
    await expect(service.login({
      email: 'player@example.com', password: 'correct-horse-battery-staple',
    }, '127.0.0.1')).rejects.toThrow('Invalid email or password');
    expect(sessions.createSessionInTransaction).not.toHaveBeenCalled();
  });

  it('signs in an already-linked Google identity by provider subject', async () => {
    prisma.externalIdentity.findUnique.mockResolvedValue({ user: { ...user } });
    google.verify.mockResolvedValue({
      sub: 'google-subject-123', email: 'player@example.com', email_verified: true,
    });
    const result = await service.googleSignIn('signed-google-id-token', '127.0.0.1');
    expect(prisma.externalIdentity.findUnique).toHaveBeenCalledWith({
      where: { provider_providerSubject: { provider: 'GOOGLE', providerSubject: 'google-subject-123' } },
      include: { user: true },
    });
    expect(sessions.createSessionInTransaction).toHaveBeenCalled();
    expect(result.user.id).toBe('user-1');
  });

  it('does not auto-link Google to an existing email account', async () => {
    prisma.externalIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ ...user });
    google.verify.mockResolvedValue({
      sub: 'google-subject-456', email: 'player@example.com', email_verified: true,
    });
    await expect(service.googleSignIn('signed-google-id-token', '127.0.0.1'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(sessions.createSessionInTransaction).not.toHaveBeenCalled();
  });

  it('creates a new Google account from a verified provider identity', async () => {
    prisma.externalIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    google.verify.mockResolvedValue({
      sub: 'google-subject-new', email: 'newplayer@example.com',
      email_verified: true, name: 'New Player',
    });
    await service.googleSignIn('signed-google-id-token', '127.0.0.1');
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: 'newplayer@example.com',
        emailVerifiedAt: expect.any(Date),
        externalIdentities: {
          create: expect.objectContaining({
            provider: 'GOOGLE',
            providerSubject: 'google-subject-new',
            emailVerified: true,
          }),
        },
      }),
    }));
    expect(sessions.createSessionInTransaction).toHaveBeenCalled();
  });
});