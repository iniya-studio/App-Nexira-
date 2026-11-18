import { ConfigService } from '@nestjs/config';
import { GuestConversionReplayCrypto, GuestConversionReplayAad } from './guest-conversion-replay-crypto';

describe('GuestConversionReplayCrypto', () => {
  const key = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  const aad: GuestConversionReplayAad = {
    replayId: '00000000-0000-4000-8000-000000000001',
    guestIdentityId: '00000000-0000-4000-8000-000000000002',
    sourceSessionId: '00000000-0000-4000-8000-000000000003',
    sourceRefreshTokenHash: 'a'.repeat(64),
    targetUserId: '00000000-0000-4000-8000-000000000004',
    idempotencyKeyHash: 'b'.repeat(64),
  };

  function createCrypto() {
    const config = {
      getOrThrow: jest.fn((name: string) => {
        if (name === 'GUEST_CONVERSION_REPLAY_ENCRYPTION_KEY') return key;
        if (name === 'ACCESS_TOKEN_TTL_SECONDS') return '900';
        throw new Error(name);
      }),
      get: jest.fn((name: string, fallback?: string) => {
        if (name === 'GUEST_CONVERSION_REPLAY_WINDOW_SECONDS') return '300';
        return fallback;
      }),
    };
    return new GuestConversionReplayCrypto(config as unknown as ConfigService);
  }

  it('encrypts and decrypts the original response using a versioned AES-256-GCM envelope', () => {
    const crypto = createCrypto();
    const response = { tokens: { accessToken: 'access-secret', refreshToken: 'refresh-secret' } };
    const encrypted = crypto.encrypt(response, aad);

    expect(encrypted.split('.')[0]).toBe('v1');
    expect(encrypted).not.toContain('access-secret');
    expect(crypto.decrypt(encrypted, aad)).toEqual(response);
  });

  it('rejects ciphertext authenticated against different immutable replay metadata', () => {
    const crypto = createCrypto();
    const encrypted = crypto.encrypt({ result: 'ok' }, aad);

    expect(() => crypto.decrypt(encrypted, { ...aad, targetUserId: '00000000-0000-4000-8000-000000000099' }))
      .toThrow();
  });

  it('rejects malformed or unsupported ciphertext versions', () => {
    const crypto = createCrypto();
    expect(() => crypto.decrypt('v2.a.b.c', aad)).toThrow();
    expect(() => crypto.decrypt('v1.invalid.invalid.invalid', aad)).toThrow();
  });

  it('compares only valid SHA-256 hashes in constant time', () => {
    const crypto = createCrypto();
    const hash = crypto.hash('proof');
    expect(crypto.equalsHash(hash, hash)).toBe(true);
    expect(crypto.equalsHash(hash, 'not-a-hash')).toBe(false);
  });

  it('fails during construction when the replay window exceeds the access token lifetime', () => {
    const config = {
      getOrThrow: jest.fn((name: string) => name === 'ACCESS_TOKEN_TTL_SECONDS' ? '60' : key),
      get: jest.fn((name: string) => name === 'GUEST_CONVERSION_REPLAY_WINDOW_SECONDS' ? '61' : undefined),
    };
    expect(() => new GuestConversionReplayCrypto(config as unknown as ConfigService)).toThrow(
      'GUEST_CONVERSION_REPLAY_WINDOW_SECONDS must be positive and no greater than ACCESS_TOKEN_TTL_SECONDS',
    );
  });

  it('fails during construction when the independent encryption key is missing', () => {
    const config = {
      getOrThrow: jest.fn((name: string) => {
        if (name === 'ACCESS_TOKEN_TTL_SECONDS') return '900';
        throw new Error(name);
      }),
      get: jest.fn(() => '300'),
    };
    expect(() => new GuestConversionReplayCrypto(config as unknown as ConfigService))
      .toThrow('GUEST_CONVERSION_REPLAY_ENCRYPTION_KEY');
  });

  it('rejects non-canonical or incorrectly sized encryption keys during construction', () => {
    for (const invalidKey of ['', 'not-base64', 'A'.repeat(43), 'A'.repeat(43) + '===']) {
      const config = {
        getOrThrow: jest.fn((name: string) => {
          if (name === 'ACCESS_TOKEN_TTL_SECONDS') return '900';
          if (name === 'GUEST_CONVERSION_REPLAY_ENCRYPTION_KEY') return invalidKey;
          throw new Error(name);
        }),
        get: jest.fn(() => '300'),
      };
      expect(() => new GuestConversionReplayCrypto(config as unknown as ConfigService)).toThrow(
        'GUEST_CONVERSION_REPLAY_ENCRYPTION_KEY must be canonical base64 for exactly 32 bytes',
      );
    }
  });
});
