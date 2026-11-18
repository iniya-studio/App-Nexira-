import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export type GuestConversionReplayAad = {
  replayId: string;
  guestIdentityId: string;
  sourceSessionId: string;
  sourceRefreshTokenHash: string;
  targetUserId: string;
  idempotencyKeyHash: string;
};

export class GuestConversionReplayCrypto {
  constructor(private readonly config: ConfigService) {}

  hash(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  equalsHash(actualHex: string, expectedHex: string): boolean {
    if (!/^[a-f0-9]{64}$/.test(actualHex) || !/^[a-f0-9]{64}$/.test(expectedHex)) return false;
    const actual = Buffer.from(actualHex, 'hex');
    const expected = Buffer.from(expectedHex, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  encrypt(value: unknown, aad: GuestConversionReplayAad): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(this.aad(aad));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
  }

  decrypt<T>(encoded: string, aad: GuestConversionReplayAad): T {
    const parts = encoded.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Unsupported guest conversion replay ciphertext');
    const [, ivPart, tagPart, dataPart] = parts;
    if (!/^[A-Za-z0-9_-]{16}$/.test(ivPart) || !/^[A-Za-z0-9_-]{22}$/.test(tagPart) ||
        !/^[A-Za-z0-9_-]+$/.test(dataPart)) {
      throw new Error('Malformed guest conversion replay ciphertext');
    }
    const iv = Buffer.from(ivPart, 'base64url');
    const tag = Buffer.from(tagPart, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) throw new Error('Malformed guest conversion replay ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), iv);
    decipher.setAAD(this.aad(aad));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8')) as T;
  }

  replayWindowSeconds(): number {
    const value = Number(this.config.get<string>('GUEST_CONVERSION_REPLAY_WINDOW_SECONDS', '300'));
    const accessTtl = Number(this.config.getOrThrow<string>('ACCESS_TOKEN_TTL_SECONDS'));
    if (!Number.isSafeInteger(value) || value <= 0 || !Number.isSafeInteger(accessTtl) || accessTtl <= 0 || value > accessTtl) {
      throw new Error('GUEST_CONVERSION_REPLAY_WINDOW_SECONDS must be positive and no greater than ACCESS_TOKEN_TTL_SECONDS');
    }
    return value;
  }

  private key(): Buffer {
    const raw = this.config.getOrThrow<string>('GUEST_CONVERSION_REPLAY_ENCRYPTION_KEY');
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== raw.replace(/=+$/, '')) {
      throw new Error('GUEST_CONVERSION_REPLAY_ENCRYPTION_KEY must be canonical base64 for exactly 32 bytes');
    }
    return key;
  }

  private aad(value: GuestConversionReplayAad): Buffer {
    return Buffer.from([
      'nexira-guest-conversion-replay',
      value.replayId,
      value.guestIdentityId,
      value.sourceSessionId,
      value.sourceRefreshTokenHash,
      value.targetUserId,
      value.idempotencyKeyHash,
    ].join('\n'), 'utf8');
  }
}
