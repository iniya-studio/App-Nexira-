import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { createHash } from 'node:crypto';
import { GoogleIdentityVerifier } from './google-identity-verifier';
import { PrismaService } from '../../prisma/prisma.service';

describe('GoogleIdentityVerifier', () => {
  const nonce = 'n'.repeat(43);
  let verifier: GoogleIdentityVerifier;
  let prisma: {
    googleAuthChallenge: {
      create: jest.Mock;
      deleteMany: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      googleAuthChallenge: {
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    verifier = new GoogleIdentityVerifier({
      getOrThrow: jest.fn().mockReturnValue('nexira-google-client-id'),
    } as unknown as ConfigService, prisma as unknown as PrismaService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('issues a short-lived random challenge and stores only its SHA-256 hash', async () => {
    const result = await verifier.createChallenge();
    expect(result.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expiresAt).toBeTruthy();
    expect(prisma.googleAuthChallenge.create).toHaveBeenCalledWith({
      data: {
        nonceHash: createHash('sha256').update(result.nonce).digest('hex'),
        expiresAt: expect.any(Date),
      },
    });
    expect(prisma.googleAuthChallenge.create.mock.calls[0][0].data.nonceHash).not.toBe(result.nonce);
    expect(prisma.googleAuthChallenge.deleteMany).toHaveBeenCalled();
  });

  it('accepts a signed token with verified Google claims and atomically consumes its matching challenge', async () => {
    const payload = {
      sub: 'google-subject',
      email: 'player@example.com',
      email_verified: true,
      iss: 'https://accounts.google.com',
      aud: 'nexira-google-client-id',
      nonce,
    };
    const verify = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockResolvedValue({ getPayload: () => payload } as never);

    await expect(verifier.verify('signed-id-token', nonce)).resolves.toMatchObject(payload);
    expect(verify).toHaveBeenCalledWith({
      idToken: 'signed-id-token',
      audience: 'nexira-google-client-id',
    });
    expect(prisma.googleAuthChallenge.updateMany).toHaveBeenCalledWith({
      where: {
        nonceHash: createHash('sha256').update(nonce).digest('hex'),
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it('rejects a token without a verified email claim and does not consume the challenge', async () => {
    jest.spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockResolvedValue({
        getPayload: () => ({
          sub: 'google-subject',
          email: 'player@example.com',
          email_verified: false,
          iss: 'https://accounts.google.com',
          aud: 'nexira-google-client-id',
          nonce,
        }),
      } as never);

    await expect(verifier.verify('signed-id-token', nonce)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.googleAuthChallenge.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a token when the signed nonce does not match the expected challenge', async () => {
    jest.spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockResolvedValue({
        getPayload: () => ({
          sub: 'google-subject',
          email: 'player@example.com',
          email_verified: true,
          iss: 'https://accounts.google.com',
          aud: 'nexira-google-client-id',
          nonce,
        }),
      } as never);

    await expect(verifier.verify('signed-id-token', 'x'.repeat(43)))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.googleAuthChallenge.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a replayed or expired challenge when the atomic consume affects no row', async () => {
    prisma.googleAuthChallenge.updateMany.mockResolvedValue({ count: 0 });
    jest.spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockResolvedValue({
        getPayload: () => ({
          sub: 'google-subject',
          email: 'player@example.com',
          email_verified: true,
          iss: 'https://accounts.google.com',
          aud: 'nexira-google-client-id',
          nonce,
        }),
      } as never);

    await expect(verifier.verify('signed-id-token', nonce)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a missing or malformed expected nonce before contacting Google', async () => {
    const verify = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken');
    await expect(verifier.verify('signed-id-token', '')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });
});
