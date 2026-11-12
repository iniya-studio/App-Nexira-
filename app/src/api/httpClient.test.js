import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createHttpClient } from './httpClient.js';
import { getApiBaseUrl, getApiV1BaseUrl } from './apiConfig.js';

test('API config requires HTTPS in production and appends the version prefix', () => {
  assert.equal(
    getApiV1BaseUrl({ env: { VITE_API_BASE_URL: 'https://api.example.test/' }, mode: 'production' }),
    'https://api.example.test/api/v1',
  );
  assert.throws(
    () => getApiBaseUrl({ env: {}, mode: 'production' }),
    /must be configured/,
  );
  assert.throws(
    () => getApiBaseUrl({ env: { VITE_API_BASE_URL: 'http://api.example.test' }, mode: 'production' }),
    /HTTPS/,
  );
});

test('HTTP client sends JSON and attaches the in-memory access token', async () => {
  let captured;
  const client = createHttpClient({
    baseUrl: 'https://api.example.test/api/v1/',
    getAccessToken: () => 'access-token',
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  assert.deepEqual(await client.post('/guest/convert', { username: 'player' }), { ok: true });
  assert.equal(captured.url, 'https://api.example.test/api/v1/guest/convert');
  assert.equal(captured.options.headers.get('Authorization'), 'Bearer access-token');
  assert.equal(captured.options.headers.get('Content-Type'), 'application/json');
  assert.equal(captured.options.body, JSON.stringify({ username: 'player' }));
});

test('HTTP client normalizes backend errors without losing status or payload', async () => {
  const client = createHttpClient({
    baseUrl: 'https://api.example.test/api/v1',
    authenticated: false,
    fetchImpl: async () => new Response(JSON.stringify({ message: 'Invalid credentials', code: 'AUTH_INVALID' }), { status: 401 }),
  });

  await assert.rejects(
    client.post('/auth/login', { email: 'a@example.test', password: 'x' }, { authenticated: false }),
    (error) => error instanceof ApiError
      && error.status === 401
      && error.code === 'AUTH_INVALID'
      && error.message === 'Invalid credentials',
  );
});

test('HTTP client rejects malformed API paths before making a request', async () => {
  const client = createHttpClient({
    baseUrl: 'https://api.example.test/api/v1',
    fetchImpl: async () => { throw new Error('fetch should not run'); },
  });
  await assert.rejects(client.get('//attacker.example/path'), /absolute paths/);
});
