import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { GoogleIdentityVerifier } from './google-identity-verifier';

describe('GoogleIdentityVerifier', () => {
  const verifier = new GoogleIdentityVerifier({
    getOrThrow: jest.fn().mockReturnValue('nexira-google-client-id'),
  } as unknown as ConfigService);
  const nonce = 'n'.repeat(43);

  afterEach(() => jest.restoreAllMocks());

  it('accepts a signed token with verified Google identity claims and matching nonce', async () => {
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
  });

  it('rejects a token without a verified email claim', async () => {
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
  });

  it('rejects a valid Google token when its nonce does not match the request', async () => {
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
  });

  it('rejects a missing expected nonce', async () => {
    await expect(verifier.verify('signed-id-token', ''))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
