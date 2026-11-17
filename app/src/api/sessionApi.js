export function createSessionApi(http) {
  if (!http || typeof http.post !== 'function') {
    throw new TypeError('A configured HTTP client is required.');
  }

  return {
    startGuest: (options = {}) => http.post('/guest/start', undefined, { ...options, authenticated: false }),
    convertGuest: (credentials, options = {}) => http.post('/guest/convert', credentials, options),
    register: (credentials, options = {}) => http.post('/auth/register', credentials, { ...options, authenticated: false }),
    login: (credentials, options = {}) => http.post('/auth/login', credentials, { ...options, authenticated: false }),
    createGoogleChallenge: (options = {}) => http.post('/auth/google/challenge', undefined, { ...options, authenticated: false }),
    signInWithGoogle: (identity, options = {}) => http.post('/auth/google', identity, { ...options, authenticated: false }),
    requestPasswordReset: (email, options = {}) => http.post('/auth/password/forgot', { email }, { ...options, authenticated: false }),
    resetPassword: (token, newPassword, options = {}) => http.post('/auth/password/reset', { token, newPassword }, { ...options, authenticated: false }),
    changePassword: (currentPassword, newPassword, options = {}) => http.post('/account/password/change', { currentPassword, newPassword }, options),
    linkGoogleIdentity: (identity, options = {}) => http.post('/account/identities/google/link', identity, options),
    verifyEmail: (token, options = {}) => http.post('/auth/email/verify', { token }, { ...options, authenticated: false }),
    resendVerification: (options = {}) => http.post('/auth/email/resend', undefined, options),
    refresh: (refreshToken, idempotencyKey, options = {}) => http.post(
      '/sessions/refresh',
      { refreshToken, idempotencyKey },
      { ...options, authenticated: false },
    ),
    logout: (options = {}) => http.post('/sessions/logout', undefined, options),
    getMyProfile: (options = {}) => http.get('/profile/me', options),
    updateMyProfile: (changes, options = {}) => http.patch('/profile/me', changes, options),
    getMyAccount: (options = {}) => http.get('/account/me', options),
    listSessions: (options = {}) => http.get('/sessions', options),
    logoutAll: (options = {}) => http.post('/sessions/logout-all', undefined, options),
    revokeSession: (sessionId, options = {}) => http.delete(`/sessions/${encodeURIComponent(sessionId)}`, options),
  };
}
