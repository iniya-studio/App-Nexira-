import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

@Injectable()
export class GoogleIdentityVerifier {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService) {}

  async verify(idToken: string): Promise<TokenPayload> {
    try {
      const audience = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
      const ticket = await this.client.verifyIdToken({ idToken, audience });
      const payload = ticket.getPayload();
      if (
        !payload ||
        !payload.sub ||
        !payload.email ||
        payload.email_verified !== true ||
        !payload.iss ||
        !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) ||
        !payload.aud
      ) {
        throw new Error('Required verified Google claims are missing');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Google authentication could not be verified');
    }
  }
}