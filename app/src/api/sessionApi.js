export function createSessionApi(http) {
  if (!http || typeof http.post !== 'function') {
    throw new TypeError('A configured HTTP client is required.');
  }

  return {
    startGuest: (options) => http.post('/guest/start', undefined, options ? { ...options, authenticated: false } : { authenticated: false }),
    convertGuest: (credentials, options) => options ? http.post('/guest/convert', credentials, options) : http.post('/guest/convert', credentials),
    register: (credentials, options) => http.post('/auth/register', credentials, options ? { ...options, authenticated: false } : { authenticated: false }),
    login: (credentials, options) => http.post('/auth/login', credentials, options ? { ...options, authenticated: false } : { authenticated: false }),
    createGoogleChallenge: (options) => http.post('/auth/google/challenge', undefined, options ? { ...options, authenticated: false } : { authenticated: false }),
    signInWithGoogle: (identity, options) => http.post('/auth/google', identity, options ? { ...options, authenticated: false } : { authenticated: false }),
    requestPasswordReset: (email, options) => http.post('/auth/password/forgot', { email }, options ? { ...options, authenticated: false } : { authenticated: false }),
    resetPassword: (token, newPassword, options) => http.post('/auth/password/reset', { token, newPassword }, options ? { ...options, authenticated: false } : { authenticated: false }),
    changePassword: (currentPassword, newPassword, options) => options ? http.post('/account/password/change', { currentPassword, newPassword }, options) : http.post('/account/password/change', { currentPassword, newPassword }),
    linkGoogleIdentity: (identity, options) => options ? http.post('/account/identities/google/link', identity, options) : http.post('/account/identities/google/link', identity),
    verifyEmail: (token, options) => http.post('/auth/email/verify', { token }, options ? { ...options, authenticated: false } : { authenticated: false }),
    resendVerification: (options) => options ? http.post('/auth/email/resend', undefined, options) : http.post('/auth/email/resend'),
    refresh: (refreshToken, idempotencyKey, options) => http.post(
      '/sessions/refresh',
      { refreshToken, idempotencyKey },
      { ...options, authenticated: false },
    ),
    logout: (options) => options ? http.post('/sessions/logout', undefined, options) : http.post('/sessions/logout'),
    getMyProfile: (options) => options ? http.get('/profile/me', options) : http.get('/profile/me'),
    updateMyProfile: (changes, options) => options ? http.patch('/profile/me', changes, options) : http.patch('/profile/me', changes),
    getMyAccount: (options) => options ? http.get('/account/me', options) : http.get('/account/me'),
    listSessions: (options) => options ? http.get('/sessions', options) : http.get('/sessions'),
    logoutAll: (options) => options ? http.post('/sessions/logout-all', undefined, options) : http.post('/sessions/logout-all'),
    revokeSession: (sessionId, options) => options ? http.delete(`/sessions/${encodeURIComponent(sessionId)}`, options) : http.delete(`/sessions/${encodeURIComponent(sessionId)}`),
  };
}
