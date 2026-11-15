# NEX-FE-002 — Profile & Account Contracts

**Project:** NEXIRA  
**Document:** NEX-FE-002  
**Version:** 1.0  
**Status:** Technical contract baseline — ready for CI validation and implementation planning  
**Target branch:** `main`  
**Related contracts:** NEX-BE-002 Identity & Access; NEX-BE-009 Matchmaking; NEX-BE-010 Progression & Ranking  
**Scope:** Player profile, registered account, guest profile continuity, authentication entry points, account recovery, and session controls.

---

## 1. Purpose and governing decisions

This document closes the design gap identified by the Profile/Account audit. It defines observable behavior, data ownership, API contracts, security requirements, and acceptance tests before implementation.

The existing NestJS modular monolith, Prisma schema, identity/session model, guest-conversion transaction, progression ledger, and ranking services remain the baseline. Do not introduce a parallel identity system or rewrite healthy modules.

### 1.1 Product decisions

1. Guest play remains available without registration or forced onboarding.
2. A guest can keep playing and may convert the same guest identity into a registered account without losing eligible progression.
3. A user signing in to an existing account from a guest session is **not** silently merging the guest profile or progress. The client must clearly warn that the current guest session will be replaced. Guest conversion is the only supported progress-preserving upgrade path.
4. The server is the source of truth for registered identity, editable display name, XP/level, ranking, match-derived statistics, inventory ownership, and account security state.
5. Local storage may hold non-authoritative presentation preferences and temporary cache only. It must never be treated as proof of account identity, official XP, match results, or ranking.
6. The current `CompanionProfile` is the cosmetic AI-companion appearance record. It is not the player's identity/profile and must not be repurposed as one.
7. Profile/account work in this phase is functional and contract-first. Full visual redesign, motion/animation work, and global UI reskin are explicitly out of scope.
8. No payment, Store ownership, or competitive advantage may be fabricated by the client.
9. Apple Sign-In is a later iOS release integration. Google is the V1 external sign-in provider.
10. Username changes, external-identity linking/unlinking, social graph, public profile discovery, and full privacy export/deletion workflows require separate policy/contract decisions; they are not to be improvised inside this implementation.

### 1.2 Existing baseline — reuse, do not duplicate

- `User`: registered email, username, displayName, preferredLanguage, status, emailVerifiedAt.
- `AccountCredential`: Argon2id password hash and passwordChangedAt.
- `ExternalIdentity`: provider + stable provider subject.
- `GuestIdentity`: guest principal and conversion state.
- `UserSession` / `RefreshToken`: session ownership, refresh rotation, replay detection and revocation.
- `EmailVerificationToken`: one-time email verification.
- `UserProgress` / `GuestProgress` and their XP ledgers: authoritative progression.
- `GlobalUserRanking` / `UserRanking`: authoritative ranking aggregates.
- `MatchParticipant` and finalized match records: source for match-derived statistics.
- `CompanionProfile`: optional cosmetic companion appearance only.

No second User, Account, Guest, Session, XP, or player-profile identity model is permitted.

---

## 2. Domain model and source-of-truth rules

### 2.1 Player profile

A player profile is the identity-facing representation used by Profile, Ranking, and match surfaces.

| Field | Registered USER | GUEST |
|---|---|---|
| principal ID | User.id | GuestIdentity.id |
| displayName | User.displayName | server-persisted guest display name |
| username | User.username | null |
| preferredLanguage | User.preferredLanguage | device/local preference until conversion |
| level / XP | UserProgress | GuestProgress |
| ranking | Global/seasonal ranking records, subject to eligibility | not eligible for registered-user ranking |
| match statistics | finalized server match records / authoritative aggregates | finalized server match records |
| account email / providers | private account data | not applicable |

**Required additive schema change:** add a nullable, validated `displayName` field to `GuestIdentity` (or an equivalent minimal guest-owned profile field if Prisma review demonstrates a better existing home). Do not add a parallel profile table. Existing guest records without a value receive a deterministic server fallback display name until edited. Guest display names are transferred into `User.displayName` when the guest is converted unless the conversion request explicitly supplies a replacement.

For registered users, `User.displayName` is canonical. `username` remains unique and immutable in V1. Display names are not unique and must not be used as authorization identifiers.

### 2.2 Profile field validation

- Normalize display names with Unicode NFC and trim leading/trailing whitespace.
- Accept international Unicode letters/marks, numbers, spaces, and a small documented set of ordinary punctuation; do not impose a Latin-only rule.
- Reject control characters, invisible control/bidi override characters, empty values, and values outside 1–40 Unicode code points after normalization.
- Never accept `userId`, `guestIdentityId`, `principalId`, XP, level, wins, losses, ranking position, or inventory ownership from a profile update payload.
- A profile update may change only fields explicitly allowed by the DTO.
- `preferredLanguage` is a supported locale code from the server's allowlist. Until the global localization contract is approved, retain current supported values `en` and `fa`; do not persist an unsupported language as active.

### 2.3 Official statistics

- XP and level come from `UserProgress` / `GuestProgress` and the corresponding transaction ledger.
- Ranking comes from existing ranking services and remains independent of XP.
- Match counts, wins, losses, and draws must be derived from finalized server match records or authoritative aggregate tables only.
- Do not use `localStorage` fields such as `battles`, `bestScore`, `recentRuns`, `categoryStats`, or client-reported results as official profile statistics.
- If an aggregate cannot yet be computed reliably for a principal, return `null` / an explicit unavailable state rather than a fabricated zero or locally cached value.
- Existing `GET /progression/me` and ranking endpoints remain canonical for progression/ranking; do not duplicate their business logic in a new profile service.

---

## 3. API contracts

All routes are under `/api/v1`. DTO validation, ownership checks, rate limits, and consistent error envelopes are mandatory. All account routes require a verified access token unless explicitly described as public-token or unauthenticated.

### 3.1 Player profile

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/profile/me` | USER or GUEST | Return the caller's canonical player profile |
| PATCH | `/profile/me` | USER or GUEST | Update caller's allowed profile fields |

Example response:

```json
{
  "principalType": "USER",
  "profile": {
    "displayName": "Player",
    "username": "player_01",
    "preferredLanguage": "en",
    "createdAt": "2026-11-15T12:00:00.000Z"
  },
  "statistics": {
    "matchesPlayed": 0,
    "wins": 0,
    "losses": 0,
    "draws": 0,
    "availability": "AVAILABLE"
  }
}
```

- The profile response must not expose email, password metadata, provider subject, session tokens, or private audit data.
- For GUEST, `username` is null and `createdAt` is the guest identity creation time.
- `PATCH` accepts only `displayName` and, for USER principals, `preferredLanguage`. A guest language remains a client preference until conversion; guest displayName is server-persisted.
- Updates are scoped exclusively to the principal attached by AccessTokenGuard. Client-supplied owner IDs are rejected/ignored by strict DTO validation.
- Successful conversion copies the latest server guest displayName to the new User unless a validated displayName override is included in the conversion request.
- Profile update responses return the canonical saved values.

### 3.2 Private account summary

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/account/me` | registered USER | Return private account summary |

Example response:

```json
{
  "user": {
    "id": "uuid",
    "email": "player@example.com",
    "username": "player_01",
    "displayName": "Player",
    "preferredLanguage": "en",
    "status": "ACTIVE",
    "createdAt": "2026-11-15T12:00:00.000Z",
    "emailVerifiedAt": null
  },
  "authentication": {
    "passwordEnabled": true,
    "providers": ["GOOGLE"]
  },
  "emailVerification": {
    "required": true,
    "verified": false
  }
}
```

- Return only safe provider names, never provider subject or credential hashes.
- A GUEST principal receives a clear registered-account-required response; guest identity is available from `GET /profile/me`.
- The response is the authoritative source for account state after cold app restore. The client must not infer account details from an old in-memory login response.
- Account summary retrieval must not create a new session or rotate tokens.

### 3.3 Authentication entry points

The existing endpoints remain:

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| POST | `/auth/register` | Independent email/password registration | Existing backend |
| POST | `/auth/login` | Email/password sign-in | Existing backend |
| POST | `/auth/google` | Google ID-token sign-in | Existing backend |
| POST | `/guest/convert` | Convert the authenticated guest to email/password account | Existing backend |
| POST | `/auth/email/verify` | Consume one-time email verification token | Existing backend |
| POST | `/auth/email/resend` | Resend verification message | Existing backend |

Client requirements:

- Signed-out users can reach both **Sign in** and **Create account**; registration must call `/auth/register` and must not be hidden behind guest conversion.
- Guest users can choose **Create permanent account** (progress-preserving conversion) or **Sign in to existing account** (replaces the current guest session; no merge).
- Google Sign-In is available from signed-out state. In a guest session it must show the same explicit no-merge warning before replacing the guest session. Google sign-in must not silently transfer guest progression.
- Backend Google verification remains authoritative. The app must send the provider ID token, not client-decoded claims.
- A matching email must never auto-link a Google identity to an existing password account. Return a safe conflict and direct the user to authenticate to the existing account.
- External identity linking/unlinking is not included in this V1 contract. It requires a separate authenticated, recent-authentication, explicit-confirmation contract.
- Apple Sign-In is not required until the iOS release; do not display a nonfunctional Apple action.

### 3.4 Email verification

- Keep the existing one-time hashed-token verification endpoint and resend endpoint.
- Complete the app flow: accept a verified HTTPS app link (and a development-only custom scheme where required), extract the token without logging it, call `POST /auth/email/verify`, then refresh `GET /account/me`.
- Verification tokens must be single-use, expiring, high entropy, stored only as hashes, and invalidated when a newer token is issued.
- Resend responses must not reveal whether an email/account exists; preserve the existing generic accepted behavior for ineligible/already-verified accounts.
- If SMTP is unavailable or delivery fails, show an accurate non-verified state and a retry path. Never display “verified” based on a successful registration response.
- Tokens must not be sent to analytics, crash reports, app logs, or third-party deep-link telemetry.

### 3.5 Password recovery and password change

Add the following server contracts before enabling password recovery in the client:

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/password/forgot` | none | Request a recovery email |
| POST | `/auth/password/reset` | one-time reset token | Set a new password |
| POST | `/account/password/change` | USER + current password / recent auth | Change password |

Requirements:

- Forgot-password always returns the same generic accepted response and similar timing whether or not the account exists.
- Reset tokens are high entropy, single-use, short-lived, stored only as hashes, rate-limited, and never logged.
- Use a dedicated `PasswordResetToken` persistence model; do not overload `EmailVerificationToken` with a second security purpose.
- Reset consumes the token atomically, updates the Argon2id hash and `passwordChangedAt`, invalidates outstanding reset tokens, and revokes all active sessions. User must sign in again.
- Password change requires current credential proof or an explicitly defined recent-authentication mechanism; Google-only accounts without a password credential must not be routed through password reset.
- Send a security notification after a successful change/reset where email delivery is available.
- Never send passwords or raw tokens in logs or analytics.

### 3.6 Session management

NEX-BE-002 already defines the intended session controls. Implement them without changing refresh rotation semantics:

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/sessions` | registered USER | List the caller's active/recent sessions |
| POST | `/sessions/logout-all` | registered USER | Revoke all sessions belonging to caller |
| DELETE | `/sessions/:sessionId` | registered USER | Revoke one session owned by caller |
| POST | `/sessions/logout` | USER or GUEST | Revoke current session |

- Never allow one user to enumerate or revoke another user's sessions.
- Mark the current session by comparing the authenticated `sid`; do not trust a client-supplied current-session flag.
- Return only safe metadata: session ID, createdAt, expiresAt, lastSeenAt if implemented, platform/device label if captured, and isCurrent.
- Extend `UserSession` only with additive migration(s) for optional bounded client metadata if required; device labels are untrusted display hints, not proof of device identity.
- `logout-all` revokes all USER sessions including the current one; the client clears secure local credentials and returns to signed-out state.
- Deleting the current session uses the normal logout path. Revoke effects must apply to REST and WebSocket authorization.
- Guest users may revoke only their current guest session and cannot list sessions.

---

## 4. Guest conversion and data continuity

Guest conversion is a critical no-data-loss flow and must preserve the current implementation's transaction guarantees.

1. Require the currently authenticated GUEST principal.
2. Validate email/username uniqueness and password policy before creating the USER.
3. In one Serializable transaction, create the User and AccountCredential, transfer eligible progression snapshot and XP ledger idempotently, move the CompanionProfile row if present, preserve eligible waiting/matched queue and active match associations according to existing lock-order rules, mark the guest CONVERTED, revoke guest sessions/refresh tokens, create the USER session, and write audit events.
4. Preserve completed historical match participant identity; do not rewrite historical guest records to appear as a registered user.
5. Copy guest displayName to User.displayName unless the conversion request supplies an explicit valid replacement.
6. A repeated request must not duplicate XP, profile rows, match participation, or sessions. A guest already converted to another account must be rejected.
7. A failed transaction must leave the guest identity, progress, and active session usable.
8. Do not weaken/remove existing PostgreSQL concurrency tests, idempotency constraints, or lock-order protections.

Signing in to an existing account is a different operation: it replaces the current guest session after a clear warning and does not merge the guest's XP/history into the destination account. A future account-merge feature would require its own anti-abuse and audit contract.

---

## 5. Client lifecycle and state contract

The app must represent these states distinctly:

| State | Meaning | Required behavior |
|---|---|---|
| `idle` | Not initialized | No account claim |
| `initializing` | Secure session restore in progress | Avoid duplicate guest creation |
| `guest` | Valid guest session | Play allowed; profile editable; conversion and sign-in options available |
| `authenticated` | Valid registered USER session | Account summary/profile load; account controls available |
| `signed-out` | No valid stored session or explicit logout | Sign-in, independent registration, Google sign-in |
| `offline` | Network unavailable during restore/load | Preserve last known non-sensitive cached view, clearly mark stale; do not create a second identity just because network is unavailable |
| `unsupported` | Platform lacks secure session adapter | Do not silently fall back to plaintext storage |
| `error` | Unexpected initialization or contract error | Recoverable error and retry; no fabricated account state |

### 5.1 Cold restore sequence

1. Read the refresh token and pending refresh-attempt metadata from platform secure storage.
2. If present, complete the existing bounded idempotent refresh flow.
3. If refresh succeeds, restore principal/session.
4. Fetch `GET /account/me` for USER or `GET /profile/me` for either principal, plus existing `GET /progression/me`.
5. Publish authenticated state only after the canonical profile/account state is resolved; if a non-critical read fails, retain authenticated session state but show an explicit partial/stale-data state.
6. If no credential exists and network is available, create one guest session.
7. If network is unavailable, remain offline/restore-pending; do not create a new guest identity and risk fragmenting progress.
8. A 401 from refresh clears invalid credentials. A transient network error does not clear a potentially valid refresh token.

Access tokens remain memory-only. Refresh tokens and retry metadata remain in platform secure storage. No browser/localStorage plaintext fallback is permitted for session credentials.

### 5.2 Profile cache

- Cache only a versioned server response for display continuity.
- Mark cache freshness and never submit cached statistics as mutations.
- On network recovery, revalidate against server and replace cache.
- Logout clears account-private cached data; guest cache must be scoped to guest principal.
- The cache must not contain raw access/refresh tokens, passwords, reset tokens, or email-verification tokens.

### 5.3 Platform support

Android secure storage is the current V1 implementation baseline. iOS requires a Keychain adapter implementing the same interface before persistent iOS account sessions are enabled. Never degrade to plaintext storage to make another platform appear supported.

---

## 6. Privacy, security, and error behavior

- Every read/write is scoped to the authenticated principal; client IDs are never authorization.
- Enforce DTO whitelist/forbid non-whitelisted fields and reject over-posting.
- Apply rate limits to registration, login, Google sign-in, verification resend, forgot/reset password, profile edits, and session-management operations. Current process-local limiters are single-instance controls only; distributed production enforcement remains a release gate.
- Use generic responses for login, forgot-password, verification resend, and other account-enumerating operations.
- Audit security-sensitive events: registration, login success/failure, Google sign-in, email verification issue/success/failure, password reset/change, session revoke, logout-all, guest conversion success/failure. Audit metadata must exclude raw credentials/tokens.
- Never return password hashes, refresh-token hashes, provider subjects, raw verification/reset tokens, or other users' private data.
- Profile displayName is public-facing; email and authentication methods are private to the account owner.
- Do not claim account deletion/export is available until a separate retention/legal policy and implementation are approved. Before public global release, provide a compliant data export and account-deletion request flow with clear retention/anonymization rules; preserve competition integrity without retaining unnecessary personal data.
- Security controls must be server-enforced even if the client hides a button or route.

### 6.1 Error contract

Use stable machine-readable error codes and safe localized client messages. At minimum:

| Code | Meaning |
|---|---|
| `AUTHENTICATION_FAILED` | Generic login failure |
| `ACCOUNT_CONFLICT` | Email/username/provider conflict |
| `EMAIL_VERIFICATION_REQUIRED` | Protected action requires verified email |
| `INVALID_OR_EXPIRED_TOKEN` | Verification/reset token invalid, expired, or consumed |
| `SESSION_REVOKED` | Current session is no longer valid |
| `SESSION_NOT_FOUND` | Session absent or not owned by caller |
| `PROFILE_VALIDATION_FAILED` | Profile fields rejected |
| `RATE_LIMITED` | Operation temporarily throttled |
| `NETWORK_UNAVAILABLE` | Client cannot reach API; not an account-state result |

Do not expose stack traces, database details, or account existence in public error messages.

---

## 7. Required additive persistence changes

The contract does not authorize immediate schema changes; implementation must be reviewed against the live Prisma schema first.

Expected additions, only if required by the accepted endpoint design:

1. `GuestIdentity.displayName` nullable field for server-owned guest profile continuity.
2. `PasswordResetToken` model with user relation, tokenHash unique, expiresAt, consumedAt, createdAt, and indexes for user/expiry.
3. Optional `UserSession` metadata: platform, bounded deviceLabel, appVersion, lastSeenAt. Do not store invasive hardware identifiers or raw IP history as device identity.
4. If account deletion is later approved, use a separately designed lifecycle state and retention migration; do not repurpose an existing status without reviewing all status guards and foreign-key behavior.

All schema changes require new additive Prisma migrations. Never rewrite the approved initial migration or delete existing user/game history to simplify the feature.

---

## 8. Acceptance and test matrix

A contract item is not DONE until the relevant tests pass in CI and its evidence is recorded.

### 8.1 Profile API tests

- USER can read and update only their own profile.
- GUEST can read and update only their own guest displayName.
- Another principal's ID in payload/path cannot access or modify their data.
- Unicode NFC, RTL text, emoji policy, max-length boundaries, whitespace, control/bidi characters, and malformed payloads are tested.
- Username, email, XP, level, ranking, match stats, and ownership cannot be modified through profile DTOs.
- Profile reads use authoritative server data; localStorage values cannot override official values.
- Missing progress returns the documented default level/XP without inventing match stats.
- Guest conversion preserves the canonical guest displayName.

### 8.2 Account/authentication tests

- Signed-out independent registration succeeds and returns canonical account state.
- Guest conversion preserves eligible progression and remains idempotent under retry/concurrency.
- Existing-account login from guest does not transfer guest XP and the UI warning is present.
- Google token validation checks signature, issuer, audience, expiry, verified email and stable subject; no auto-link by email.
- Cold restore fetches account summary and profile after successful refresh.
- Email verification deep-link consumes a single-use token and refreshes account state.
- Resend/forgot-password responses do not disclose account existence.
- Password reset token is hashed, single-use, expiring, rate-limited and revokes sessions.
- Session list/revoke/logout-all enforce ownership and current-session semantics.
- Transient offline restore does not create duplicate guest identities or destroy a valid refresh token.
- Logout clears secure credentials and private cached account data.

### 8.3 CI gates

Backend CI must pass:
- Prisma formatting and schema validation.
- Prisma client generation.
- PostgreSQL migration deployment.
- NestJS production build.
- Unit and PostgreSQL-backed integration tests.
- ESLint.

Android CI must pass after client implementation:
- Frontend and session lifecycle tests.
- Profile/account API and UI-state tests.
- Vite/Capacitor build.
- Gradle APK build and APK verification.

Do not disable, delete, weaken, or skip tests to obtain a green run. Record exact run IDs, tested commit SHA, suite/test totals, and any warnings. A documentation-only CI run validates repository/backend workflow health but does not prove that the proposed runtime behavior has been implemented.

---

## 9. Implementation sequence

Implement in dependency order, keeping each change small and testable:

1. **Contract and schema review:** confirm additive migration needs; no code changes until this review is complete.
2. **Profile persistence/API:** guest displayName field, profile GET/PATCH, validation, authorization, unit + PostgreSQL integration tests.
3. **Account summary and cold restore:** GET account summary; hydrate profile/account/progression after refresh; offline-safe lifecycle tests.
4. **Independent registration and Google entry:** signed-out registration UI, Google native-token acquisition and backend call; guest no-merge warning.
5. **Email verification completion:** app-link handling, verify call, account refresh; delivery remains explicitly unavailable until SMTP/provider is configured.
6. **Password recovery/change:** dedicated token persistence, endpoints, notification, abuse controls, tests.
7. **Session management:** session metadata, list/revoke/logout-all, client controls and integration tests.
8. **Privacy release gates:** define export/deletion policy with jurisdictional review before global public release.
9. **End-to-end acceptance:** guest → conversion → restart → profile restore; signed-out → registration → verification; Google sign-in; logout/revoke; network interruption/recovery.

Do not begin full UI/UX redesign during these steps. Use existing components as functional surfaces and change layout/styling only when required to expose a correct state or accessible action.

---

## 10. Explicit non-goals and release blockers

- No full visual redesign, new design system, animation pass, or Store redesign.
- No real payment or inventory ownership changes in this contract.
- No account merging across two registered accounts.
- No automatic Google-to-password account linking.
- No username rename in V1.
- No Apple Sign-In until iOS release work.
- No claim of global launch readiness while iOS secure storage, email delivery, distributed abuse controls, data export/deletion policy, and live production verification remain incomplete.

**Acceptance rule:** NEX-FE-002 defines the target behavior. Existing code is not considered compliant merely because an endpoint or component exists. Each implementation item must be mapped to code, tests, CI evidence, and a verified commit on `main`.
