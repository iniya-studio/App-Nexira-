import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { GoogleIdentityVerifier } from './google-identity-verifier';

describe('GoogleIdentityVerifier', () => {
  const verifier = new GoogleIdentityVerifier({
    getOrThrow: jest.fn().mockReturnValue('nexira-google-client-id'),
  } as unknown as ConfigService);

  afterEach(() => jest.restoreAllMocks());

  it('accepts a signed token with verified Google identity claims', async () => {
    const payload = {
      sub: 'google-subject',
      email: 'player@example.com',
      email_verified: true,
      iss: 'https://accounts.google.com',
      aud: 'nexira-google-client-id',
    };
    const verify = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockResolvedValue({ getPayload: () => payload } as never);

    await expect(verifier.verify('signed-id-token')).resolves.toMatchObject(payload);
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
        }),
      } as never);

    await expect(verifier.verify('signed-id-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});