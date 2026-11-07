# NEX-BE-002 — Identity & Access Contracts

**Project:** NEXIRA  
**Document:** NEX-BE-002  
**Version:** 1.0-draft  
**Status:** Draft for owner review  
**Target branch:** `feature/backend-foundation`  
**Scope:** Guest Identity, Authentication, Session Management, and Guest-to-User conversion

---

## 1. Purpose

This document defines the runtime contracts and implementation boundaries for the three identity subsystems:

1. **Guest Identity** — creates and maintains a non-registered player identity.
2. **Auth** — verifies registered-account credentials and external identity providers.
3. **Session** — issues, validates, rotates, and revokes access credentials for both registered users and guests.

The purpose is to implement these capabilities against the existing Prisma schema without creating duplicate identity/session models or rewriting the approved initial migration.

This document is a technical contract. It does not authorize production deployment, payment integration, or changes to unrelated game systems.

## 2. Existing technical baseline

The following are treated as approved project constraints:

- Node.js 24+, TypeScript, NestJS
- PostgreSQL 16+, Prisma 6.19.x
- REST API and WebSocket
- Modular Monolith
- Backend is authoritative for identity, authorization, match state, timing, scoring, and progression.
- Initial migration exists at `backend/prisma/migrations/00000000000000_init/migration.sql`.
- The initial migration was generated and tested against a temporary PostgreSQL database in GitHub Actions. No production database is currently claimed to exist.
- Work continues on `feature/backend-foundation`; no merge to the integration or main branch is implied.

### 2.1 Existing identity-related Prisma models

The current schema already contains the core persistence structures:

| Model / enum | Responsibility |
|---|---|
| `User` | Registered account and profile |
| `AccountCredential` | Password hash for a registered account |
| `ExternalIdentity` | Google / Apple provider identity |
| `GuestIdentity` | Guest principal and conversion state |
| `UserSession` | One session owned by exactly one User or GuestIdentity |
| `RefreshToken` | Hashed refresh-token history and rotation metadata |
| `EmailVerificationToken` | One-time email verification token |
| `IdentityAuditEvent` | Security and identity audit event |
| `PrincipalType` | USER or GUEST |
| `GuestIdentityStatus` | ACTIVE, CONVERTED, REVOKED |
| `IdentityProvider` | GOOGLE, APPLE |

**Schema preservation rule:** Reuse these models. Do not add parallel models such as `GuestSession`, `UserIdentity`, or a second password-credential table unless a demonstrated requirement cannot be represented safely by the current schema.

## 3. Domain boundaries and ownership

### 3.1 Guest Identity module

Owns:
- Guest creation and lifecycle.
- Guest principal status.
- Guest-to-match participation association.
- Guest conversion workflow and conversion metadata.
- Guest-specific policy checks.

Does not own:
- Password verification.
- Google / Apple token verification.
- Refresh-token rotation implementation.
- Match scoring or match-history rewriting.

Primary persistence: `GuestIdentity`. Match association remains through `MatchParticipant.guestIdentityId`.

### 3.2 Auth module

Owns:
- Email/password registration and login.
- Password hash verification and password policy.
- Google identity-token verification.
- External identity linking and unlinking policy.
- Registered-account status and email-verification policy.

Primary persistence: `User`, `AccountCredential`, `ExternalIdentity`, `EmailVerificationToken`.

Auth verifies a credential and resolves a registered `User`. It does not implement refresh-token storage or rotation itself.

### 3.3 Session module

Owns:
- Session creation for either a User or GuestIdentity.
- Access-token issuance and validation.
- Opaque refresh-token issuance, rotation, replay detection, and revocation.
- Logout and session lifecycle.
- Session ownership and active-status checks.

Primary persistence: `UserSession`, `RefreshToken`.

A session is owned by exactly one principal. The existing database CHECK constraint on `UserSession` must remain in force:

- User session: `userId != null` and `guestIdentityId == null`.
- Guest session: `userId == null` and `guestIdentityId != null`.

### 3.4 Shared principal contract

After authentication, controllers and application services use a normalized principal:

| Field | Type | Meaning |
|---|---|---|
| `principalType` | `USER` or `GUEST` | Principal category |
| `principalId` | UUID | User ID or GuestIdentity ID |
| `sessionId` | UUID | Current UserSession ID |

For a USER principal, `principalId` is the `User.id`. For a GUEST principal, it is the `GuestIdentity.id`.

Do not treat a client-supplied `principalId`, `userId`, `guestIdentityId`, or `participantKey` as proof of identity. The authenticated principal must be derived from a verified access token and validated session.

Authorization is policy-based on the server. A guest is not a registered user and must not gain registered-only capabilities by changing client payloads.

## 4. Credential and token contracts

### 4.1 Access token

Use a signed JWT with a short lifetime (initial target: 10–15 minutes).

Required claims:

| Claim | Meaning |
|---|---|
| `iss` | Configured NEXIRA issuer |
| `aud` | Configured NEXIRA API audience |
| `sub` | Principal ID |
| `principalType` | USER or GUEST |
| `sid` | UserSession ID |
| `jti` | Unique token identifier |
| `iat` | Issued-at time |
| `exp` | Expiration time |

Validation must check signature, allowed algorithm, issuer, audience, expiry, principal type, and active session. Never accept an algorithm selected by an untrusted token header. Signing keys and secrets must come from environment configuration / a secrets manager, never source control.

Access tokens are not stored in plaintext in the database. Do not put passwords, refresh tokens, provider secrets, or sensitive personal data in JWT claims.

### 4.2 Refresh token

- Generate a cryptographically secure, opaque, high-entropy random token (minimum 256 bits of entropy).
- Return the raw token only to the client over TLS.
- Store only a one-way hash in `RefreshToken.tokenHash`.
- Never log raw tokens.
- A refresh token belongs to one `UserSession`.
- Rotation consumes the presented token and creates its successor; the old row remains for replay detection.
- A consumed/revoked/expired token must not issue a new session or access token, except for the narrowly bounded idempotent retry contract below.

The existing `idempotencyKeyHash`, `retryResponseCiphertext`, and `retryResponseExpiresAt` fields support safe retry when a client did not receive a successful refresh response. The implementation must:
1. Require a client-generated high-entropy idempotency key for a refresh attempt.
2. Bind its hash to the session and presented refresh-token record.
3. Return the same result only for the same valid retry key during a short configured retry window.
4. Encrypt any temporarily retained response containing a raw successor token using an application encryption key stored outside the repository.
5. Expire and clear retry ciphertext promptly.
6. Treat reuse with a different retry key, or reuse outside the permitted retry window, as suspected replay and revoke the affected session.

If secure response encryption and bounded cleanup cannot be implemented, do not silently store a raw successor token; fail closed and revise the retry behavior before release.

### 4.3 Session lifetime

- Each session has an absolute expiry in `UserSession.expiresAt`.
- Each refresh token has its own expiry in `RefreshToken.expiresAt`.
- A session is invalid if revoked, expired, or its owning principal is not eligible to authenticate.
- Refresh rotation does not extend a session beyond its configured absolute lifetime unless a separate, explicit sliding-lifetime policy is approved.
- Initial lifetime values are configuration, not hard-coded product rules; choose and document production values before release.

## 5. End-to-end flows

### 5.1 Start guest play

1. Client calls `POST /api/v1/guest/start`.
2. Guest Identity applies rate limits and creates a `GuestIdentity` with status ACTIVE.
3. Guest Identity asks Session to create a guest-owned `UserSession`.
4. Session creates the initial refresh-token record and issues a short-lived access JWT.
5. Client receives the guest principal summary, access token, refresh token, and expiry metadata.
6. The client stores credentials using platform-appropriate secure storage. The guest ID alone is never sufficient to restore ownership.

Guest start must be safe against automated abuse through rate limits, request validation, and monitoring. Do not require registration to play.

### 5.2 Guest authentication on API and WebSocket

1. Client presents the access token.
2. Authentication guard validates the JWT.
3. Session validation confirms the referenced session is active and belongs to the same principal.
4. Principal is attached to request / WebSocket context.
5. Authorization policy checks whether that principal type may perform the requested action.

WebSocket authentication follows the same principal and session rules as REST. Reconnection must revalidate the current credential; a stale connection must not remain authorized after session revocation.

### 5.3 Registered email/password registration

1. Client submits email, password, username, display name, and required profile fields.
2. Auth normalizes the email consistently and validates input and password policy.
3. Auth creates the `User` and `AccountCredential` atomically.
4. Password is hashed using a modern password-hashing algorithm (Argon2id preferred; parameters must be benchmarked and configurable).
5. Auth initiates email verification using `EmailVerificationToken`.
6. Auth asks Session to create a USER session according to the approved verification policy.
7. Client receives the response contract and verification status.

The exact rule for restricted actions before email verification must be enforced server-side. Email verification must not be represented as successful merely because a provider supplied an email string.

### 5.4 Email/password login

1. Client submits normalized email and password.
2. Auth looks up the account and verifies the password hash.
3. Return a generic authentication failure for unknown email and incorrect password; do not disclose account existence.
4. Reject or restrict suspended/deleted accounts.
5. On success, Auth asks Session to create a USER session.
6. Session returns access and refresh credentials.

Apply rate limits and abuse controls by account identifier, IP / network signals, and other risk signals. Avoid permanent account lockout that can be abused to deny service.

### 5.5 Google Sign-In

1. Client obtains a Google ID token using the approved Google client integration.
2. Client sends the ID token to the backend.
3. Auth validates signature using Google's trusted key set, issuer, audience/client ID, expiry, and required claims.
4. Auth identifies the external account by the stable provider subject (`sub`), not by email alone.
5. If the provider subject is already linked, resolve its NEXIRA User.
6. If it is not linked, follow explicit account-creation / linking policy.
7. On success, Auth asks Session to create a USER session.

Do not trust client-decoded Google claims. Do not automatically link an existing NEXIRA account solely because email strings match. Linking requires the user to authenticate to the existing NEXIRA account and explicitly confirm the operation.

Apple uses the same provider-independent contract when added for the iOS release. Apple is not required for the initial V1 implementation.

### 5.6 Refresh

1. Client sends refresh token and an idempotency key to `POST /api/v1/sessions/refresh`.
2. Session hashes the presented token and locates the matching record.
3. Session validates token expiry, revocation/consumption state, owning session, and principal status.
4. Session atomically consumes the old token, creates a successor, and links it through `replacedByTokenId`.
5. Session returns a new access token and refresh token.
6. Concurrent refresh attempts must be serialized or guarded by a transaction / conditional update so only one rotation wins, with the same-key retry exception defined in section 4.2.

A refresh token is never accepted as an API access token.

### 5.7 Logout and revocation

- Logout current session: revoke the current `UserSession` and its active refresh tokens.
- Logout all registered-user sessions: revoke all active sessions belonging to the authenticated User.
- Revoke one device session: require ownership check against the authenticated User.
- Guest logout: revoke the current guest session. It must not revoke another guest's session.
- Password change, account suspension, account deletion, and confirmed credential compromise must revoke affected sessions according to the security policy.

Revocation must be effective for REST and WebSocket authorization. WebSocket connections associated with a revoked session must be disconnected or denied on the next authorization check.

### 5.8 Guest-to-User conversion

Conversion is an explicit authenticated operation, not an account merge based on a guest ID.

1. Client authenticates as the active GUEST principal.
2. Client submits registration credentials or completes a supported external-provider registration flow.
3. Auth creates or resolves a USER account only after credential ownership and uniqueness checks.
4. Guest Identity verifies the current guest principal and conversion eligibility.
5. In one database transaction, set:
   - `GuestIdentity.status = CONVERTED`
   - `GuestIdentity.convertedToUserId = User.id`
   - `GuestIdentity.convertedAt = now()`
6. Preserve existing `MatchParticipant.guestIdentityId` references. Do not rewrite completed match history or change historical participant identity.
7. Revoke guest sessions and prevent new guest refreshes.
8. Create a new USER session and return USER credentials.

The `GuestIdentity.convertedToUserId` relation is the supported link for retrieving the converted guest's eligible history. History aggregation / display is a separate read policy and must not rewrite source match records.

Conversion must be idempotent: retries for the same guest and same target account return a safe consistent result; attempts to convert the same guest to a different account are rejected and audited. Never permit a client to select an arbitrary `convertedToUserId`.

## 6. Initial REST API contract

All routes use the `/api/v1` prefix. Request and response DTOs must be validated; secrets must never appear in logs.

| Method | Endpoint | Owner | Purpose |
|---|---|---|---|
| POST | `/guest/start` | Guest Identity | Create guest and guest session |
| POST | `/auth/register` | Auth | Register email/password account |
| POST | `/auth/login` | Auth | Email/password login |
| POST | `/auth/google` | Auth | Verify Google ID token and sign in |
| POST | `/auth/convert-guest` | Auth + Guest Identity | Convert authenticated guest |
| POST | `/sessions/refresh` | Session | Rotate refresh token |
| POST | `/sessions/logout` | Session | Revoke current session |
| POST | `/sessions/logout-all` | Session | Revoke all sessions for current USER |
| GET | `/sessions` | Session | List current USER's active/recent sessions |
| DELETE | `/sessions/:sessionId` | Session | Revoke an owned USER session |
| POST | `/auth/email/verify` | Auth | Consume email verification token |
| POST | `/auth/email/resend` | Auth | Request verification email resend |

The session-list and logout-all endpoints are registered-USER-only in V1. Guest credentials may refresh and revoke their own session but cannot enumerate other sessions.

### 6.1 Token response

Successful guest start, registration, login, Google login, conversion, and refresh return a consistent envelope:

```json
{
  "principal": {
    "principalType": "USER",
    "principalId": "uuid"
  },
  "session": {
    "sessionId": "uuid",
    "expiresAt": "ISO-8601 timestamp"
  },
  "tokens": {
    "accessToken": "opaque-to-client-jwt",
    "accessTokenExpiresAt": "ISO-8601 timestamp",
    "refreshToken": "opaque-random-secret",
    "refreshTokenExpiresAt": "ISO-8601 timestamp"
  }
}
```

For guest start, `principalType` is `GUEST`. Do not expose password hashes, token hashes, provider subject identifiers, audit metadata, or internal credential records.

### 6.2 Error envelope

Use a stable machine-readable error structure:

```json
{
  "error": {
    "code": "AUTHENTICATION_FAILED",
    "message": "The supplied credentials are invalid.",
    "requestId": "correlation-id"
  }
}
```

Use appropriate HTTP status codes (400 validation, 401 unauthenticated/invalid credential, 403 authenticated but forbidden, 409 conflict, 429 rate limited, 5xx unexpected server failure). Avoid error messages that reveal whether an email is registered.

## 7. Authorization rules

- USER and GUEST are distinct principal types.
- Guest may access only explicitly guest-enabled gameplay and account-conversion operations.
- Guest cannot access registered-only profile management, global ranking participation, Store purchase flows, session enumeration, or user-only social features.
- Registered-only operations require USER principal and an ACTIVE User account.
- Suspended or deleted users cannot authenticate or refresh.
- AI participants are not authenticated principals and do not receive user/guest tokens.
- Match authorization must verify that the principal owns or is authorized for the referenced participant/match; knowing a match or participant UUID is not authorization.
- Client-provided role, principal type, score, ownership, or account status is never authoritative.

The exact guest eligibility for individual gameplay endpoints is enforced by application policy and must be covered by tests.

## 8. Security and operational requirements

1. Enforce HTTPS in deployed environments.
2. Use DTO validation, input normalization, request-size limits, and rate limiting.
3. Use secure password hashing; never encrypt passwords for reversible storage.
4. Store refresh-token hashes only; compare using safe hash-verification practices.
5. Keep JWT signing and retry-response encryption keys outside Git.
6. Rotate secrets through an operational procedure; support key identifiers for JWT verification during key rotation.
7. Use generic authentication errors and abuse monitoring.
8. Audit successful and failed security-sensitive events through `IdentityAuditEvent`; never store raw passwords or tokens in metadata.
9. Minimize personal data in logs and define retention/cleanup jobs for expired verification and refresh-token records.
10. Use database transactions for account creation, refresh rotation, guest conversion, and session revocation.
11. Apply conditional updates / locking to prevent concurrent refresh or conversion races.
12. Validate REST and WebSocket credentials against the same session lifecycle.
13. Do not allow account deletion to erase competitive or purchase history; follow the existing soft-delete/anonymization policy.
14. Secrets, provider credentials, and encryption keys must be configured separately per environment.

## 9. Data integrity and schema notes

The existing schema is the baseline. The following invariants must be checked in service logic and, where appropriate, reinforced with database constraints:

- A UserSession has exactly one owner (already represented by the initial migration CHECK).
- A guest conversion's status and conversion metadata agree (already represented by the initial migration CHECK).
- Only ACTIVE guests may start or continue guest sessions.
- CONVERTED or REVOKED guests cannot obtain new refresh tokens.
- A User must be ACTIVE to create or refresh a USER session.
- Refresh-token rotation must be atomic and maintain a single valid successor chain.
- A GuestIdentity can be converted only once.
- Historical MatchParticipant guest references remain immutable during conversion.
- Email normalization and uniqueness must be consistent across registration and login.
- External provider subject uniqueness is enforced by `@@unique([provider, providerSubject])`.

### 9.1 Email verification scope

The current `EmailVerificationToken` model requires `userId` and optionally references `guestIdentityId`. V1 policy is therefore:

- Email verification is a registered-account capability.
- Guest start does not require or issue email verification.
- During guest conversion, create the User first and issue a User-owned verification token.
- Do not issue a guest-only verification token using the current schema.
- Before implementation, confirm whether registration creates a restricted, unverified account session or requires verification before issuing a full session. The recommended V1 behavior is to allow a limited session while restricting sensitive/account-recovery actions until verification.

No schema change is required solely to support this policy.

### 9.2 Schema changes

No schema change is approved by this document alone. If implementation reveals a required change:
1. Explain the concrete gap and why service logic is insufficient.
2. Propose the smallest additive Prisma change.
3. Generate a new migration; never rewrite the approved initial migration.
4. Validate with the existing migration workflow and Prisma checks.

## 10. NestJS module layout and dependency direction

Suggested module layout:

```text
backend/src/modules/
  identity/
    identity.module.ts
    contracts/
      authenticated-principal.ts
      token-claims.ts
      auth-error-codes.ts
    guards/
      access-token.guard.ts
      principal-policy.guard.ts
  guest-identity/
    guest-identity.module.ts
    guest-identity.controller.ts
    guest-identity.service.ts
  auth/
    auth.module.ts
    auth.controller.ts
    auth.service.ts
    password.service.ts
    providers/
      google-identity-verifier.ts
  session/
    session.module.ts
    session.controller.ts
    session.service.ts
    access-token.service.ts
    refresh-token.service.ts
```

Dependency rules:

- Auth may call Session through an exported Session application service.
- Guest Identity may call Session through the same Session application service.
- Session must not depend on Auth or Guest Identity services. It receives a validated principal descriptor and owns session/token persistence.
- Shared principal and token-claim types belong in a small identity-contracts area, not duplicated across modules.
- Avoid circular NestJS module dependencies. Orchestration of multi-module workflows belongs in an application-level use case/service.
- Prisma access should remain behind module services/repositories; controllers must not contain persistence or security logic.

## 11. Implementation sequence

### Phase 0 — contract and configuration
- Approve this document.
- Define environment variables for JWT issuer/audience/signing keys, access lifetime, refresh lifetime, password hashing parameters, retry encryption key, and provider client IDs.
- Define secure client token storage expectations for the existing React / Capacitor client.

### Phase 1 — Guest Identity + Session foundation
- Implement shared principal and token claim types.
- Implement Session creation for USER and GUEST owners.
- Implement guest start.
- Implement access JWT issuance and guard.
- Implement refresh-token hashing, rotation, replay detection, and current-session logout.
- Add guest status and ownership checks.
- Test guest start, API access, refresh, replay, expiry, and logout.

### Phase 2 — registered Auth
- Implement password hashing and registration.
- Implement email/password login.
- Implement Google ID-token verification.
- Implement explicit external identity linking.
- Add generic errors, rate limits, and audit events.
- Test invalid credentials, duplicate email, provider mismatch, and account status.

### Phase 3 — Guest conversion
- Implement authenticated conversion.
- Preserve historical MatchParticipant guest references.
- Revoke guest session(s) and issue a new USER session.
- Test duplicate conversion, competing conversion attempts, history preservation, and rollback on failure.

### Phase 4 — full session lifecycle
- Implement logout-all and owned-session revocation/listing for registered users.
- Implement password-change and account-status revocation hooks.
- Verify WebSocket disconnect / re-authentication behavior.
- Add cleanup for expired tokens and verification records.

### Phase 5 — email verification and hardening
- Implement verification email delivery through a provider-independent adapter.
- Implement verify/resend endpoints and abuse controls.
- Complete security, concurrency, and integration tests.
- Apple Sign-In is deferred until the iOS release milestone.

## 12. Acceptance criteria

The Identity & Access implementation is not complete until:

- A new guest can start playing without registration.
- Guest identity survives app restart when the client retains its refresh credential securely.
- A guest cannot impersonate another guest by changing IDs.
- Guest refresh rotation is atomic and replay is detected.
- A registered user can register and log in with email/password.
- Google ID tokens are verified by the backend, not trusted from client claims.
- External identities cannot be attached to an existing account based only on matching email.
- Guest conversion preserves all historical match records and links history through `convertedToUserId`.
- Conversion cannot be repeated to attach one guest to a different user.
- Revoked/expired sessions fail for REST and WebSocket.
- User-only endpoints reject guest principals.
- Audit logs contain no raw credentials or tokens.
- Automated tests cover concurrency, replay, expiry, account status, and failure rollback.

## 13. Decisions requiring owner confirmation before the relevant implementation

These are deliberately isolated so they do not block the Guest Identity foundation:

1. **Unverified email session:** recommended: allow a limited USER session after registration, but restrict sensitive actions until email verification.
2. **Session lifetime values:** choose absolute session and refresh-token lifetimes before release; keep them configurable.
3. **Google account creation:** recommended: allow first-time Google sign-in to create a NEXIRA account only when required provider claims are verified; never auto-link to an existing account solely by email.
4. **Guest conversion target:** recommended: conversion creates/attaches one registered User and keeps the original guest identity as immutable historical provenance.
5. **Guest retention:** define a cleanup/retention period for abandoned guest identities only after checking match-history, audit, and legal retention requirements.

These decisions must not be silently guessed during implementation. Where a decision is not required for the current phase, implementation may proceed without it.

---

**End of NEX-BE-002 v1.0-draft**
