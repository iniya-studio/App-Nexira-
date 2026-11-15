import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'node:crypto';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GoogleIdentityVerifier {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  async createChallenge(): Promise<{ nonce: string; expiresAt: string }> {
    const nonce = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
    await this.prisma.googleAuthChallenge.deleteMany({
      where: {
        OR: [
          { expiresAt: { lte: now } },
          { consumedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
        ],
      },
    });
    await this.prisma.googleAuthChallenge.create({
      data: { nonceHash: this.hash(nonce), expiresAt },
    });
    return { nonce, expiresAt: expiresAt.toISOString() };
  }

  async verify(idToken: string, expectedNonce: string): Promise<TokenPayload> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(expectedNonce)) {
      throw new UnauthorizedException('Google authentication could not be verified');
    }

    const audience = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Google authentication could not be verified');
    }

    if (
      !payload ||
      !payload.sub ||
      !payload.email ||
      payload.email_verified !== true ||
      !payload.iss ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) ||
      !payload.aud ||
      payload.nonce !== expectedNonce
    ) {
      throw new UnauthorizedException('Google authentication could not be verified');
    }

    const now = new Date();
    const consumed = await this.prisma.googleAuthChallenge.updateMany({
      where: {
        nonceHash: this.hash(expectedNonce),
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException('Google authentication could not be verified');
    }
    return payload;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
