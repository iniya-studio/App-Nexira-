# NEX-BE-004 — Registered Authentication Implementation Record

**Project:** NEXIRA  
**Document:** NEX-BE-004  
**Version:** 1.0  
**Status:** Phase 2 core implementation complete — CI verified; email verification delivery remains a release gate  
**Target branch:** `feature/backend-foundation`  
**Related contract:** `NEX-BE-002 — Identity & Access Contracts`  
**Previous phase:** `NEX-BE-003 — Guest Identity & Session Foundation`

---

## 1. Purpose

This record documents the registered-account authentication implementation built on the existing Phase 1 identity and session foundation.

This is an implementation record, not production deployment approval. It does not claim that email delivery, client integration, production secrets, or production database setup are complete.

## 2. Implemented capabilities

### 2.1 Email and password registration

- `POST /api/v1/auth/register`
- Email is trimmed and normalized to lowercase.
- DTO validation checks email format, password length (12–128 characters), username format (3–20 alphanumeric/underscore characters), and display-name length.
- Passwords are hashed with Argon2id; no plaintext password is persisted.
- Argon2 memory, time, and parallelism parameters are configurable.
- User and AccountCredential are created atomically.
- A USER-owned session is created through the existing SessionService in the same database transaction.
- Duplicate email or username conflicts return a conflict response.
- New email/password accounts have `emailVerifiedAt = null`.

The registration response explicitly reports email verification as required but not delivered:
`emailVerification: { required: true, verified: false, delivery: "NOT_CONFIGURED" }`.

### 2.2 Email and password login

- `POST /api/v1/auth/login`
- Email normalization matches registration.
- Password verification uses Argon2id.
- Unknown email, incorrect password, and ineligible/suspended accounts receive the same generic authentication failure.
- A dummy Argon2id verification is performed for unknown accounts to reduce account-enumeration timing differences.
- Successful login creates a USER session through SessionService.
- Login success and failure security events are audited.

### 2.3 Google Sign-In

- `POST /api/v1/auth/google`
- The backend verifies the Google ID token using Google's trusted verification library and key infrastructure.
- Verification checks the configured audience/client ID, issuer, expiry/signature through the library, stable subject, and verified email claim.
- External identity lookup uses `provider + providerSubject`, not email alone.
- First-time account creation is permitted only when Google supplies a verified email.
- A matching email on an existing NEXIRA account is not automatically linked. The user must authenticate to the existing account before a future explicit linking flow.
- Google account creation, ExternalIdentity creation, session creation, and audit event are transactional.
- Suspended or deleted users cannot sign in.

### 2.4 Verified-email authorization policy

An exported `EmailVerifiedGuard` is available for protected routes:

- Guest principals are allowed through this guard so guest play remains available.
- Registered users must exist, be ACTIVE, and have `emailVerifiedAt` set.
- Protected controllers must apply this guard after the access-token authentication guard where verified email is required.

No current gameplay/ranking controller is being claimed as protected by this guard; feature modules must apply the policy when those routes are implemented.

### 2.5 Abuse controls and audit

- Initial process-local rate limits exist for registration, email login, and Google login.
- Authentication success/failure and registration events are recorded in IdentityAuditEvent.
- The rate limiter is a basic single-instance control, not a distributed production abuse system.

## 3. API endpoints added

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/auth/register` | Email/password registration |
| POST | `/api/v1/auth/login` | Email/password login |
| POST | `/api/v1/auth/google` | Google ID-token sign-in |

All successful authentication flows reuse the Phase 1 session response contract, including access token, refresh token, and expiry metadata.

## 4. Dependencies and configuration

Added backend dependencies:

- `argon2` for Argon2id password hashing.
- `google-auth-library` for server-side Google ID-token verification.

New environment configuration is documented in `backend/.env.example`:

- `GOOGLE_CLIENT_ID`
- `ARGON2_MEMORY_COST_KIB`
- `ARGON2_TIME_COST`
- `ARGON2_PARALLELISM`
- `AUTH_LOGIN_MAX_ATTEMPTS`
- `AUTH_LOGIN_WINDOW_SECONDS`
- `AUTH_REGISTER_MAX_ATTEMPTS`
- `AUTH_REGISTER_WINDOW_SECONDS`

The example values are placeholders/default development parameters, not production secrets or final production tuning.

## 5. CI verification evidence

GitHub Actions run:

- Run ID: `42393979745`
- Result: `success`
- Tested commit: `5e4a58786a381bc929836f92a29fe4b72f12e6c9`
- Workflow: Backend CI

Verified checks:

- Backend dependency installation.
- Prisma formatting and schema validation.
- Prisma Client generation.
- Initial migration deployment against PostgreSQL 16 CI service.
- NestJS production build.
- Unit and PostgreSQL integration test job.
- ESLint.

Test summary:

- 7 test suites passed.
- 24 tests passed.

Coverage includes registration normalization and duplicate handling, password login and generic failures, suspended-account rejection, Google identity resolution/no-auto-link/first-time creation, Google token claim verification, verified-email guard policy, and the existing guest/session foundation tests.

Run URL:
https://github.com/iniya-studio/App-Nexira-/actions/runs/42393979745

## 6. Persistence and branch integrity

- Existing Prisma models were reused: User, AccountCredential, ExternalIdentity, UserSession, RefreshToken, and IdentityAuditEvent.
- No Prisma schema changes were needed.
- The approved initial migration was not modified.
- No production database was created or changed.
- All work remains on `feature/backend-foundation`.
- No merge to integration or main was performed.

## 7. Remaining work and release gates

1. **Email verification delivery and completion:** No mail provider has been selected/configured. Verification-token issuance, delivery, and the `POST /api/v1/auth/email/verify` completion endpoint remain follow-on work. Do not represent email/password accounts as verified until that flow succeeds.
2. **Sensitive-route enforcement:** Apply `EmailVerifiedGuard` to registered-user actions that require verified email as those feature routes are introduced.
3. **Distributed abuse protection:** Replace or supplement process-local authentication limits with a shared/edge-enforced strategy before multi-instance production.
4. **Google production configuration:** Set the real Google OAuth client ID for the deployed client; never accept an audience supplied by the request.
5. **Argon2id benchmarking:** Benchmark memory/time parameters on the actual production deployment target before finalizing them.
6. **Dependency reproducibility:** Add and commit a backend-specific lockfile before release; the current backend CI installs from package.json.
7. **Session lifetime values:** Absolute session and refresh-token lifetimes remain unset in the example configuration and require owner approval before release.
8. **Client integration:** Secure token storage, refresh retry handling, registration/login UI wiring, and end-to-end device testing remain unverified.
9. **Account linking and recovery:** Explicit Google linking to an existing authenticated account, password reset, and Apple Sign-In remain separate follow-on capabilities.

## 8. Phase 2 decision

**Phase 2 core authentication implementation is accepted as implemented and CI-verified for continued backend development.**

This acceptance does not waive the release gates in Section 7. In particular, email/password registration must not be treated as production-ready until email verification delivery and completion are implemented and verified.
