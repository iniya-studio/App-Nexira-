export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createHttpClient({
  baseUrl,
  getAccessToken = () => null,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
} = {}) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new TypeError('A configured API base URL is required.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation is required.');
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

    const requestHeaders = new Headers(headers);
    if (body !== undefined && !requestHeaders.has('Content-Type')) {
      requestHeaders.set('Content-Type', 'application/json');
    }

    if (authenticated) {
      const accessToken = await getAccessToken();
      if (accessToken) requestHeaders.set('Authorization', `Bearer ${accessToken}`);
    }

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
        const message = typeof payload?.message === 'string'
          ? payload.message
          : `API request failed with status ${response.status}.`;
        throw new ApiError(message, {
          status: response.status,
          code: typeof payload?.code === 'string' ? payload.code : 'HTTP_ERROR',
          details: payload,
        });
      }
      return payload;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) {
        throw new ApiError('The API request was aborted or timed out.', {
          code: 'REQUEST_ABORTED',
          details: error,
        });
      }
      throw new ApiError('Unable to reach the NEXIRA API.', {
        code: 'NETWORK_ERROR',
        details: error,
      });
    } finally {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener('abort', abortFromCaller);
    }
  }

  return {
    request,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  };
}
