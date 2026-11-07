# NEX-BE-003 — Guest Identity & Session Foundation Record

**Project:** NEXIRA  
**Document:** NEX-BE-003  
**Version:** 1.0  
**Status:** Phase 1 implementation complete — CI verified  
**Target branch:** `feature/backend-foundation`  
**Related contract:** `NEX-BE-002 — Identity & Access Contracts`

---

## 1. Purpose

This record closes Phase 1 of NEX-BE-002 and captures what was implemented, what was verified, and what remains intentionally outside this phase.

Phase 1 is complete for the current backend foundation. This is not a production-readiness or deployment approval.

## 2. Implemented capabilities

### 2.1 Guest identity

- `POST /api/v1/guest/start` creates an ACTIVE GuestIdentity.
- Guest creation, guest-owned session creation, initial refresh credential creation, and the initial audit event run in one database transaction.
- Guest identity remains distinct from a registered User.
- A basic per-client guest-start abuse guard is present.

### 2.2 Session and credentials

- A normalized USER/GUEST principal contract is defined.
- Signed HS256 access JWTs include issuer, audience, subject, principal type, session ID, token ID, issued-at, and expiry claims.
- Access-token validation checks signature, algorithm, issuer, audience, time claims, principal type, active session, and matching active principal ownership.
- Refresh tokens are cryptographically random (256-bit source entropy); only SHA-256 hashes are persisted.
- Refresh rotation uses a database transaction with Serializable isolation and a conditional consume operation.
- A bounded idempotent retry response is encrypted using AES-256-GCM and cleared after its configured retry window.
- Reuse of a consumed refresh token with a different or expired retry key revokes the session and its refresh credentials and records an audit event.
- Session logout revokes the session and its refresh credentials.
- REST and WebSocket access-token guards share the same session/principal validation service.

### 2.3 Configuration

The runtime configuration template documents:
- JWT signing secret, issuer, and audience.
- Refresh-retry encryption key.
- Access-token lifetime.
- Absolute session and refresh-token lifetime settings.
- Retry window.
- Guest-start limiter settings.
- Explicit trusted-proxy hop configuration.

Absolute session and refresh-token lifetime values remain intentionally unset in the template until the owner approves release values.

## 3. Verification evidence

GitHub Actions run:
- Run ID: `42385968043`
- Result: `success`
- Tested commit: `e19b978909c3de59d93f50abc0f23a4bac1e220c`
- Workflow: Backend CI

Verified checks:
- Prisma formatting check.
- Prisma schema validation.
- Prisma Client generation.
- Initial migration deployment against a PostgreSQL 16 CI service.
- NestJS production build.
- Unit and PostgreSQL-backed integration tests.
- ESLint.

Test summary:
- 4 test suites passed.
- 10 tests passed.

The PostgreSQL integration tests cover guest session creation, access-token authentication, refresh rotation, same-key idempotent retry, refresh-token replay detection and session revocation, logout, and rejection of revoked guest identities.

## 4. Persistence and branch integrity

- The approved initial migration was not modified by Phase 1.
- The Prisma schema was not modified by Phase 1.
- No production database was created or changed.
- Work remains on `feature/backend-foundation`.
- No merge to integration or main was performed.

## 5. Known limitations and release gates

The following are deliberately not represented as production-ready:

1. Guest-start rate limiting currently uses process memory and is suitable only as a basic single-instance guard. Before multi-instance production, enforce a shared/distributed limit at the trusted edge or through a shared store.
2. Production secrets must be generated and provisioned outside source control. The example values are placeholders and must never be used in production.
3. Absolute session and refresh-token lifetimes require owner approval before release.
4. Client-side secure credential storage and end-to-end client integration have not been verified in this backend phase.
5. The WebSocket authentication guard exists; a production WebSocket gateway and reconnect lifecycle are not part of Phase 1.
6. Production monitoring, alerting, abuse review, and operational key rotation remain future hardening work.

## 6. Phase 1 acceptance

| Acceptance item | Result |
|---|---|
| Guest identity can be created without registration | Complete |
| Guest-owned session and credentials are created atomically | Complete |
| Access token is bound to an active server-side session | Complete |
| Refresh tokens are hashed and rotated | Complete |
| Safe same-key retry is bounded and encrypted | Complete |
| Refresh replay revokes the affected session | Complete |
| Logout revokes the session credentials | Complete |
| REST and WebSocket guards share principal validation | Complete |
| PostgreSQL migration, build, tests, and lint pass in CI | Complete |

**Phase 1 decision:** Accepted as the completed implementation foundation for proceeding to Phase 2. This acceptance does not waive the release gates in Section 5.

## 7. Next phase — Phase 2: Registered Authentication

Proceed under the approved NEX-BE-002 contract with:

1. Email normalization and registration DTO validation.
2. Password hashing using Argon2id with configurable, benchmarked parameters.
3. Atomic creation of User and AccountCredential.
4. Email/password login with generic authentication failures and abuse controls.
5. Google ID-token verification on the backend using trusted keys, issuer, audience, expiry, and provider subject.
6. External identity resolution by provider + stable subject; no automatic linking based only on matching email.
7. User-owned session creation through the existing Session service.
8. Tests for duplicate registration, password verification, suspended/ineligible accounts, Google token validation, external identity uniqueness, and session creation.

Email verification delivery and guest-to-user conversion remain separate follow-on work unless a dependency is demonstrated and explicitly planned. Do not change the approved initial migration; any proven schema need must use a new additive migration.
