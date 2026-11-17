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


test('HTTP client refreshes once after an authenticated request receives 401', async () => {
  const authorizations = [];
  let refreshCalls = 0;
  const client = createHttpClient({
    baseUrl: 'https://api.example.test/api/v1',
    getAccessToken: () => 'expired-access-token',
    refreshAccessToken: async ({ accessToken }) => {
      refreshCalls++;
      assert.equal(accessToken, 'expired-access-token');
      return 'rotated-access-token';
    },
    fetchImpl: async (_url, options) => {
      authorizations.push(options.headers.get('Authorization'));
      if (authorizations.length === 1) {
        return new Response(JSON.stringify({ message: 'Expired', code: 'AUTH_EXPIRED' }), { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  assert.deepEqual(await client.get('/profile/me'), { ok: true });
  assert.deepEqual(authorizations, ['Bearer expired-access-token', 'Bearer rotated-access-token']);
  assert.equal(refreshCalls, 1);
});

test('HTTP client proactively refreshes when the in-memory access token has expired', async () => {
  const authorizations = [];
  let refreshCalls = 0;
  const client = createHttpClient({
    baseUrl: 'https://api.example.test/api/v1',
    getAccessToken: () => null,
    refreshAccessToken: async ({ accessToken }) => {
      refreshCalls++;
      assert.equal(accessToken, null);
      return 'restored-access-token';
    },
    fetchImpl: async (_url, options) => {
      authorizations.push(options.headers.get('Authorization'));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  assert.deepEqual(await client.get('/profile/me'), { ok: true });
  assert.deepEqual(authorizations, ['Bearer restored-access-token']);
  assert.equal(refreshCalls, 1);
});

test('HTTP client does not refresh public requests or retry a second unauthorized response', async () => {
  let refreshCalls = 0;
  let requestCalls = 0;
  const client = createHttpClient({
    baseUrl: 'https://api.example.test/api/v1',
    getAccessToken: () => 'expired-access-token',
    refreshAccessToken: async () => { refreshCalls++; return 'rotated-access-token'; },
    fetchImpl: async () => {
      requestCalls++;
      return new Response(JSON.stringify({ message: 'Still unauthorized' }), { status: 401 });
    },
  });

  await assert.rejects(
    client.get('/public', { authenticated: false }),
    (error) => error instanceof ApiError && error.status === 401,
  );
  assert.equal(refreshCalls, 0);
  await assert.rejects(
    client.get('/profile/me'),
    (error) => error instanceof ApiError && error.status === 401,
  );
  assert.equal(refreshCalls, 1);
  assert.equal(requestCalls, 3);
});


function deferredRequestValue() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('HTTP client aborts a request while waiting for proactive token restoration', async () => {
  const refreshGate = deferredRequestValue();
  let refreshStarted = false;
  let fetchCalls = 0;
  const controller = new AbortController();
  const client = createHttpClient({
    baseUrl: 'https://api.example.test/api/v1',
    getAccessToken: () => null,
    refreshAccessToken: () => {
      refreshStarted = true;
      return refreshGate.promise;
    },
    fetchImpl: async () => {
      fetchCalls++;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  const request = client.get('/profile/me', { signal: controller.signal });
  for (let i = 0; i < 20 && !refreshStarted; i++) await Promise.resolve();
  assert.equal(refreshStarted, true);

  controller.abort(new Error('screen closed'));
  await assert.rejects(request, (error) => error instanceof ApiError && error.code === 'REQUEST_ABORTED');
  refreshGate.resolve('restored-token');
  await Promise.resolve();
  assert.equal(fetchCalls, 0);
});

test('HTTP client aborts while waiting for a shared refresh after 401 without cancelling the refresh itself', async () => {
  const refreshGate = deferredRequestValue();
  let refreshStarted = false;
  let fetchCalls = 0;
  const controller = new AbortController();
  const client = createHttpClient({
    baseUrl: 'https://api.example.test/api/v1',
    getAccessToken: () => 'expired-token',
    refreshAccessToken: () => {
      refreshStarted = true;
      return refreshGate.promise;
    },
    fetchImpl: async () => {
      fetchCalls++;
      return new Response(JSON.stringify({ message: 'Expired' }), { status: 401 });
    },
  });

  const request = client.get('/profile/me', { signal: controller.signal });
  for (let i = 0; i < 20 && !refreshStarted; i++) await Promise.resolve();
  assert.equal(refreshStarted, true);

  controller.abort(new Error('screen closed'));
  await assert.rejects(request, (error) => error instanceof ApiError && error.code === 'REQUEST_ABORTED');
  refreshGate.resolve('rotated-token');
  await Promise.resolve();
  assert.equal(fetchCalls, 1);
});

test('HTTP client does not start token lookup or network work for an already-aborted request', async () => {
  const controller = new AbortController();
  controller.abort(new Error('caller cancelled'));
  let tokenLookups = 0;
  let fetchCalls = 0;
  const client = createHttpClient({
    baseUrl: 'https://api.example.test/api/v1',
    getAccessToken: () => { tokenLookups++; return 'token'; },
    fetchImpl: async () => {
      fetchCalls++;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  await assert.rejects(
    client.get('/profile/me', { signal: controller.signal }),
    (error) => error instanceof ApiError && error.code === 'REQUEST_ABORTED',
  );
  assert.equal(tokenLookups, 0);
  assert.equal(fetchCalls, 0);
});
