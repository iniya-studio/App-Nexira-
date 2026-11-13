const viteEnvironment = import.meta.env ?? {};

export function getApiBaseUrl({
  env = viteEnvironment,
  mode = env.MODE ?? 'development',
} = {}) {
  const configured = typeof env.VITE_API_BASE_URL === 'string'
    ? env.VITE_API_BASE_URL.trim()
    : '';

  if (!configured) {
    if (mode === 'production') {
      throw new Error('VITE_API_BASE_URL must be configured for production builds.');
    }
    return '';
  }

  let parsed;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('VITE_API_BASE_URL must be a valid absolute URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('VITE_API_BASE_URL must use HTTP or HTTPS.');
  }
  if (mode === 'production' && parsed.protocol !== 'https:') {
    throw new Error('VITE_API_BASE_URL must use HTTPS in production.');
  }

  return parsed.toString().replace(/\/+$/, '');
}

export function getApiV1BaseUrl(options) {
  const origin = getApiBaseUrl(options);
  return origin ? `${origin}/api/v1` : '';
}
