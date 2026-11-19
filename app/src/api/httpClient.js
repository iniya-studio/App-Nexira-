export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function createRequestAbortedError() {
  return new ApiError('The API request was aborted.', {
    code: 'REQUEST_ABORTED',
  });
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createRequestAbortedError();
}

function awaitWithAbort(value, signal) {
  if (!signal) return Promise.resolve(value);
  if (signal.aborted) return Promise.reject(createRequestAbortedError(signal.reason));

  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(createRequestAbortedError(signal.reason));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(value).then(
      (result) => {
        cleanup();
        resolve(result);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
  });
}

export function createHttpClient({
  baseUrl,
  getAccessToken = () => null,
  refreshAccessToken = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
} = {}) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new TypeError('A configured API base URL is required.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation is required.');
  }
  if (refreshAccessToken !== null && typeof refreshAccessToken !== 'function') {
    throw new TypeError('The access-token refresh handler must be a function.');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  async function request(path, {
    method = 'GET',
    body,
    headers = {},
    authenticated = true,
    signal,
  } = {}) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
      throw new TypeError('API paths must be absolute paths relative to the API base URL.');
    }

    throwIfAborted(signal);

    const baseHeaders = new Headers(headers);
    if (body !== undefined && !baseHeaders.has('Content-Type')) {
      baseHeaders.set('Content-Type', 'application/json');
    }

    let accessToken = null;
    if (authenticated) {
      accessToken = await awaitWithAbort(getAccessToken(), signal);
      // A missing in-memory access token may mean that it expired while the
      // app stayed open. Restore it before sending the protected request.
      if (!accessToken && refreshAccessToken) {
        accessToken = await awaitWithAbort(
          refreshAccessToken({ accessToken: null, path, method }),
          signal,
        );
      }
    }

    async function send(token) {
      const requestHeaders = new Headers(baseHeaders);
      if (authenticated && token) requestHeaders.set('Authorization', `Bearer ${token}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error('Request timed out.')), timeoutMs);
      const abortFromCaller = () => controller.abort(signal.reason);
      if (signal) {
        if (signal.aborted) abortFromCaller();
        else signal.addEventListener('abort', abortFromCaller, { once: true });
      }

      try {
        const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
          method,
          headers: requestHeaders,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        const raw = await response.text();
        let payload = null;
        if (raw) {
          try {
            payload = JSON.parse(raw);
          } catch {
            payload = raw;
          }
        }

        if (!response.ok) {
          return {
            error: new ApiError('The API request failed.', {
              status: response.status,
              code: typeof payload?.code === 'string' ? payload.code : 'HTTP_ERROR',
            }),
          };
        }
        return { payload };
      } catch (error) {
        if (error instanceof ApiError) return { error };
        if (controller.signal.aborted) {
          return {
            error: new ApiError('The API request was aborted or timed out.', {
              code: 'REQUEST_ABORTED',
            }),
          };
        }
        return {
          error: new ApiError('Unable to reach the NEXIRA API.', {
            code: 'NETWORK_ERROR',
          }),
        };
      } finally {
        clearTimeout(timeout);
        if (signal) signal.removeEventListener('abort', abortFromCaller);
      }
    }

    let result = await send(accessToken);
    if (authenticated && accessToken && result.error?.status === 401 && refreshAccessToken) {
      // The coordinator serializes refresh. It also returns an already-rotated
      // token when another request completed the refresh before this 401 arrived.
      const refreshedToken = await awaitWithAbort(
        refreshAccessToken({ accessToken, path, method }),
        signal,
      );
      if (refreshedToken && refreshedToken !== accessToken) {
        result = await send(refreshedToken);
      }
    }

    if (result.error) throw result.error;
    return result.payload;
  }

  return {
    request,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
    patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
    delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  };
}
