# NEX-BE-005 — Email Verification Delivery and Completion

**Project:** NEXIRA  
**Document:** NEX-BE-005  
**Version:** 1.0  
**Status:** Backend implementation and CI verified; live SMTP delivery and device acceptance remain OPEN  
**Original implementation branch:** `feature/backend-foundation`  
**Current source-of-truth branch:** `main`  
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


## 2026-11-22 verification reconciliation

- The backend verification service, token hashing/consumption, resend endpoint, SMTP adapter, and delivery-failure audit path are present in `main`.
- The Android app's `app/src/App.jsx` handles both warm `appUrlOpen` events and cold `getLaunchUrl()` startup links for `/verify-email`; it validates the token shape and calls the session lifecycle verification method. The same handler recognizes `/reset-password`.
- Backend CI run [45053997097](https://github.com/iniya-studio/App-Nexira-/actions/runs/45053997097) completed successfully on commit `a339d8b5f68bd5d60fb913aaadd0e911da296ac9`, including PostgreSQL migrations, unit/integration tests, build, lint, Compose validation, and backend image build.
- Live delivery is **not** verified: `SMTP_HOST`, sender credentials, `EMAIL_FROM`, and `EMAIL_VERIFICATION_URL` remain deployment configuration inputs. The app-link domain/asset association must also be configured and validated against the deployed domain.
- Therefore the previous “CI verification pending” status is superseded, but the release gates for real inbox delivery, deployed app-link resolution, and end-to-end device verification remain open.
