# NEX-BE-005 — Email Verification Delivery and Completion

**Project:** NEXIRA  
**Document:** NEX-BE-005  
**Version:** 1.0  
**Status:** Implementation committed; CI verification pending  
**Target branch:** `feature/backend-foundation`  
**Related contract:** `NEX-BE-002 — Identity & Access Contracts`

## 1. Scope
Complete the registered email/password verification loop without changing the approved initial Prisma migration.

## 2. API
- `POST /api/v1/auth/register`: creates the account/session and attempts verification-email delivery.
- `POST /api/v1/auth/email/verify`: accepts a 43-character Base64URL token and completes verification.
- `POST /api/v1/auth/email/resend`: requires a valid USER access token and is rate-limited per user.
- Guest accounts are excluded. Google accounts created with provider-verified email remain verified.

## 3. Token security
- 32 cryptographically random bytes; only SHA-256 hashes are stored.
- Default expiry is 24 hours, configurable with `EMAIL_VERIFICATION_TOKEN_TTL_SECONDS`.
- Issuing a new token consumes previous outstanding tokens.
- Verification atomically consumes the token, updates `User.emailVerifiedAt`, consumes other outstanding tokens, and writes an audit event.
- Invalid, expired, or consumed tokens receive a generic error.
- Resend defaults to 3 requests/user/hour. This initial process-local limit must be replaced by shared enforcement before multi-instance production.

## 4. SMTP delivery
Nodemailer provides a provider-independent SMTP adapter. Any SMTP-compatible provider can be configured.

Required: `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_SECURE`, `EMAIL_FROM`, and absolute frontend `EMAIL_VERIFICATION_URL`. Optional authentication uses `SMTP_USER` and `SMTP_PASS`, which must be supplied together. Secrets must remain in deployment secret storage.

If SMTP is not configured, registration reports `NOT_CONFIGURED` and does not create a token. If delivery fails, the account remains created, the response reports `FAILED`, and a failure audit is written; the authenticated resend endpoint can retry.

The frontend verification page must read the `token` query parameter and POST it to `/api/v1/auth/email/verify`. Live SMTP credentials and frontend wiring are deployment/client gates, not claims of this backend implementation.

## 5. Database
The existing `EmailVerificationToken` model and initial migration already contain the required columns and indexes. No schema or migration change was made.

## 6. Release gates
1. Configure SMTP credentials and sender in deployment secrets.
2. Configure the deployed frontend verification URL.
3. Configure and verify SPF, DKIM, and DMARC for the sender domain.
4. Complete a live inbox delivery and verification test.
5. Replace process-local resend limiting before multi-instance production.
6. Wire and test the frontend verification page.
7. CI must pass Prisma validation/generation, PostgreSQL migration deployment, build, tests, and ESLint.
