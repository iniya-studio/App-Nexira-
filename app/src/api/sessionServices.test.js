import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionServices } from './sessionServices.js';

function secureStorage() {
  const values = new Map();
  return {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
    async remove(key) { values.delete(key); },
  };
}

test('session services compose native storage, API, HTTP client, and coordinator', () => {
  const services = createSessionServices({
    platform: 'android',
    baseUrl: 'https://api.example.test/api/v1/',
    secureStorage: secureStorage(),
    fetchImpl: async () => { throw new Error('network should not be called during composition'); },
  });
  assert.equal(typeof services.tokenStore.getAccessToken, 'function');
  assert.equal(typeof services.sessionApi.startGuest, 'function');
  assert.equal(typeof services.coordinator.startGuest, 'function');
  assert.equal(typeof services.http.post, 'function');
  assert.equal(Object.isFrozen(services), true);
});

test('persistent sessions are disabled on platforms without a native secure adapter', () => {
  assert.throws(
    () => createSessionServices({ platform: 'web', baseUrl: 'https://api.example.test', secureStorage: secureStorage() }),
    /Android only/,
  );
  assert.throws(
    () => createSessionServices({ platform: 'ios', baseUrl: 'https://api.example.test', secureStorage: secureStorage() }),
    /Android only/,
  );
});

test('session services reject missing API configuration and secure storage', () => {
  assert.throws(
    () => createSessionServices({ platform: 'android', baseUrl: '', secureStorage: secureStorage() }),
    /API base URL/,
  );
  assert.throws(
    () => createSessionServices({ platform: 'android', baseUrl: 'https://api.example.test', secureStorage: null }),
    /Native secure storage is required/,
  );
});
