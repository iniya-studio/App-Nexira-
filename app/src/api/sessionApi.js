export function createSessionApi(http) {
  if (!http || typeof http.post !== 'function') {
    throw new TypeError('A configured HTTP client is required.');
  }

  return {
    startGuest: () => http.post('/guest/start', undefined, { authenticated: false }),
    convertGuest: (credentials) => http.post('/guest/convert', credentials),
    register: (credentials) => http.post('/auth/register', credentials, { authenticated: false }),
    login: (credentials) => http.post('/auth/login', credentials, { authenticated: false }),
    signInWithGoogle: (idToken) => http.post('/auth/google', { idToken }, { authenticated: false }),
    verifyEmail: (token) => http.post('/auth/email/verify', { token }, { authenticated: false }),
    resendVerification: () => http.post('/auth/email/resend'),
    refresh: (refreshToken, idempotencyKey) => http.post(
      '/sessions/refresh',
      { refreshToken, idempotencyKey },
      { authenticated: false },
    ),
    logout: () => http.post('/sessions/logout'),
    getMyProfile: () => http.get('/profile/me'),
    updateMyProfile: (changes) => http.patch('/profile/me', changes),
    getMyAccount: () => http.get('/account/me'),
    listSessions: () => http.get('/sessions'),
    logoutAll: () => http.post('/sessions/logout-all'),
    revokeSession: (sessionId) => http.delete(`/sessions/${encodeURIComponent(sessionId)}`),
  };
}
