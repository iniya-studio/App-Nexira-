# NEX-BE-012 — Guest Conversion Recovery Contract

**Project:** NEXIRA  
**Document:** NEX-BE-012  
**Version:** 1.4  
**Status:** Approved implementation contract — implementation in progress  
**Target branch:** `main`  
**Related contracts:** NEX-BE-002 Identity & Access; NEX-BE-003 Guest Session Foundation; NEX-BE-010 Progression & Ranking Settlement

---

## 1. Purpose

Define a secure, deterministic recovery path for the case where guest-to-user conversion commits successfully in PostgreSQL but the client does not receive the HTTP response (network loss, process termination, or response timeout).

The required outcome is that the same guest conversion can be recovered without:
- creating a second User;
- transferring progression, XP, profile, queue ownership, or match participation again;
- issuing a second independent USER session;
- requiring the revoked guest access token to authenticate the recovery request.

This contract covers email/password guest conversion in V1. Provider-based conversion must reuse the same recovery guarantees if introduced later.

## 2. Existing baseline and identified gap

The current conversion transaction creates the User, transfers eligible guest-owned data, marks GuestIdentity CONVERTED, revokes guest sessions and refresh tokens, creates a USER session, and records the conversion audit event. Email-verification delivery occurs after that transaction commits.

The conversion endpoint is protected by AccessTokenGuard. After a successful conversion the guest session is revoked, so a retry through the normal authenticated conversion route cannot recover the already-committed response. The current conversion request also has no persisted idempotency/replay response contract.

Session refresh already demonstrates a bounded encrypted-response pattern using AES-256-GCM. This contract reuses the security pattern, but keeps conversion recovery separate from RefreshToken rotation state.

## 3. Normative design decisions

1. Add a dedicated `GuestConversionReplay` persistence record; do not overload `RefreshToken.retryResponseCiphertext`.
2. The client creates one high-entropy idempotency key per conversion attempt and persists it in platform secure storage before sending the request.
3. The conversion request must also present the current guest refresh token. The server verifies that its hash belongs to the exact authenticated guest session.
4. The server binds the idempotency key to the guest, source session, and source refresh-token record. The original committed request is authoritative; no request-body fingerprint is used because recovery does not re-submit the password.
5. The successful conversion response is encrypted and stored in the same PostgreSQL transaction as the conversion and USER session creation.
6. A separate unauthenticated recovery endpoint accepts only the original guest refresh token plus the original idempotency key. It does not use AccessTokenGuard and does not issue new credentials.
7. Recovery returns the exact original response only while the replay window is open. It never repeats conversion side effects.
8. The initial replay window is **5 minutes**, configurable by `GUEST_CONVERSION_REPLAY_WINDOW_SECONDS`. It must not exceed the configured lifetime of the newly issued access token.
9. After expiry, the ciphertext is cleared and recovery returns a stable `CONVERSION_RECOVERY_EXPIRED` response. The converted account remains intact; the user must use normal registered-account login or account recovery.
10. Email-verification delivery is a separate post-commit workflow. Its failure must not roll back conversion or trigger conversion replay side effects.

## 4. API contract

All routes use the configured `/api/v1` prefix.

### 4.1 Initial conversion

`POST /guest/convert`

Authentication: required, active GUEST access token.

Required header:
- `Idempotency-Key`: cryptographically random, at least 256 bits of entropy, base64url encoded; the client must reuse the exact same key for retries of this operation.

Required request field:
- `refreshToken`: current raw refresh token belonging to the authenticated guest session.

Other fields remain the existing validated `GuestConversionDto` registration fields. The route is the existing `POST /api/v1/guest/convert`; do not introduce a parallel `/auth/convert-guest` route. Extend the DTO to accept `refreshToken`; the controller reads `Idempotency-Key` from request headers and passes both values to the application service. Redact the refresh token and idempotency key from request logs.

The server must reject the request before account creation if:
- the principal is not GUEST;
- the guest access-token session is not active and owned by that guest;
- the supplied refresh token does not hash to an unconsumed, unrevoked, unexpired RefreshToken row belonging to the exact same session;
- the idempotency key is missing, malformed, or below the entropy/length requirement.

### 4.2 Recovery

`POST /guest/convert/retry`

Authentication: no AccessTokenGuard. This is a narrowly scoped bearer-proof endpoint.

Required header:
- the same `Idempotency-Key` used for the original conversion.

Required body:
- `refreshToken`: the original guest refresh token supplied to the conversion request.

The endpoint must:
1. Validate token/key encoding and hash the presented refresh token; locate the RefreshToken row without revealing whether an arbitrary token exists.
2. Resolve the immutable source session and guest identity associated with that row. The source refresh-token row is expected to be revoked after conversion; revocation does not invalidate its use as a narrowly scoped recovery proof.
3. Acquire the same guest-principal advisory lock as conversion.
4. For the read-only recovery path, acquire locks in this order: GuestIdentity row, source UserSession row, then source RefreshToken row. The shared guest-principal advisory lock serializes recovery with conversion. Do not acquire matchmaking bucket or Match row locks in recovery: recovery does not mutate queue/match state, and taking unrelated match locks would add contention without strengthening correctness.
5. Load the unique replay record for the guest and verify source session, source refresh-token hash, idempotency-key hash, expiry, and ciphertext presence.
6. Decrypt and return the stored response only when every check succeeds.
7. Return generic authentication failure for unknown/mismatched token or key. Do not reveal guest IDs, user IDs, account email, or whether a different key has a replay record.
8. Return `CONVERSION_RECOVERY_EXPIRED` when the matching replay record exists but its replay window has expired or its ciphertext has been purged.

The recovery endpoint must never create a User, UserSession, RefreshToken, XPTransaction, profile transfer, matchmaking transfer, or conversion audit success event.

### 4.3 Response

Return the deterministic conversion response envelope persisted in the transaction: principal, session, access token, refresh token, expiry fields, and `emailVerification: { required: true, verified: false }`. Do not include an email-delivery result in this response. This response must be identical on initial success and every successful recovery.

Email delivery is a post-commit side effect and cannot be represented truthfully inside a response encrypted before commit. The service may attempt delivery after commit, but its result is not part of the conversion response contract. A delivery failure must not change the committed conversion result; the client can use the registered-account email-resend flow. Recovery must not send another email.

The recovered access token may be close to expiry. The client must use the returned USER refresh token through the normal Session refresh endpoint when required.

## 5. Persistence contract

Add one additive Prisma model and migration. Do not rewrite or amend the approved initial migration.

Proposed model:

```prisma
model GuestConversionReplay {
  id                       String   @id @default(uuid()) @db.Uuid
  guestIdentityId          String   @unique @db.Uuid
  sourceSessionId          String   @unique @db.Uuid
  sourceRefreshTokenHash   String   @unique @db.VarChar(255)
  idempotencyKeyHash       String   @db.VarChar(64)
  targetUserId             String   @db.Uuid
  responseCiphertext       String?  @db.Text
  expiresAt                DateTime @db.Timestamptz(3)
  ciphertextPurgedAt       DateTime? @db.Timestamptz(3)
  createdAt                DateTime @default(now()) @db.Timestamptz(3)

  guestIdentity GuestIdentity @relation(fields: [guestIdentityId], references: [id], onDelete: Restrict)
  sourceSession UserSession   @relation(fields: [sourceSessionId], references: [id], onDelete: Restrict)
  targetUser    User           @relation(fields: [targetUserId], references: [id], onDelete: Restrict)

  @@index([expiresAt, ciphertextPurgedAt])
  @@index([targetUserId, createdAt])
}
```

Required optional inverse relations must be added to GuestIdentity, UserSession, and User (one replay per converted guest; one source session per replay; one target user may have multiple converted guests). Validate final relation names and cardinalities against the current Prisma schema before migration generation.

The unique guest relation guarantees at most one successful conversion replay record per guest. The unique source session and source refresh-token hash bind the replay to the exact credential lineage. Keep a minimal tombstone after ciphertext cleanup so a converted guest cannot be mistaken for an unconverted guest; retention/deletion must follow the approved guest-data retention policy.

The replay record must not store raw refresh tokens, raw idempotency keys, passwords, password hashes, access tokens, or unencrypted response data.

## 6. Cryptographic requirements

### 6.1 Token and key hashes

- Store `SHA-256(rawRefreshToken)` in `sourceRefreshTokenHash`, matching the existing RefreshToken token-hash strategy.
- Store `SHA-256(idempotencyKey)` in `idempotencyKeyHash`.
- Compare hashes in constant time after validating their expected encoding and length.

### 6.2 Idempotency binding

The idempotency key and original guest refresh token are the complete recovery proof. The recovery endpoint intentionally does not request the password or registration body again; clients must not persist passwords merely to recover a response. Therefore the first committed request associated with a guest/source session is authoritative for that idempotency key, and recovery always returns its original encrypted response. The client must never reuse an idempotency key for a different operation. A new key after an ambiguous outcome is prohibited.

Because the password is not re-submitted to the recovery endpoint, the server cannot safely compare a retry request-body fingerprint during recovery. Do not add a password-derived fingerprint or a misleading `409` guarantee that the recovery endpoint cannot enforce. The source guest/session uniqueness and first-commit-wins semantics prevent duplicate conversion side effects.

### 6.3 Response encryption

- Use AES-256-GCM with a fresh cryptographically random 96-bit IV for each replay record.
- Store IV, authentication tag, and ciphertext in a versioned, unambiguous encoding.
- Use a dedicated `GUEST_CONVERSION_REPLAY_ENCRYPTION_KEY` (base64-encoded 32-byte key), independently generated and managed. Do not reuse `JWT_SECRET` or `REFRESH_RETRY_ENCRYPTION_KEY`.
- Bind immutable replay metadata as AEAD additional authenticated data (AAD): replay record ID, guest ID, source session ID, source refresh-token hash, target user ID, and idempotency-key hash.
- Include an explicit ciphertext format version to support future key rotation.
- Never log decrypted response data, tokens, keys, ciphertext, or cryptographic errors containing secrets.

If key material is missing, malformed, or unavailable, fail closed. Do not store plaintext response data.

### 6.4 Required environment configuration

Add `GUEST_CONVERSION_REPLAY_ENCRYPTION_KEY=REPLACE_WITH_INDEPENDENT_BASE64_32_BYTE_SECRET` and `GUEST_CONVERSION_REPLAY_WINDOW_SECONDS=300` to `backend/.env.example` and runtime configuration validation. The replay window must be a positive integer and must not exceed the access-token lifetime used by `AccessTokenService`.

## 7. Transaction and lock contract

The initial conversion transaction must atomically follow the established order already implemented in `GuestIdentityService.convert`:
1. Acquire the guest-principal advisory transaction lock.
2. Acquire all affected matchmaking bucket advisory locks in sorted order.
3. Acquire affected active Match row locks in sorted match-ID order.
4. Lock and revalidate the GuestIdentity row.
5. Lock and revalidate the exact authenticated guest UserSession row.
6. Lock and validate the supplied source RefreshToken row; confirm it belongs to that exact session and is unconsumed, unrevoked, and unexpired at conversion start.
7. Create the User and transfer progression, XP ledger, profile, and eligible queue/match ownership exactly once.
8. Mark GuestIdentity CONVERTED and revoke guest sessions and refresh tokens.
9. Create the USER session and its initial refresh-token record.
10. Build the exact response envelope in memory.
11. Create the GuestConversionReplay row and persist the encrypted response using the immutable metadata as AAD.
12. Record the conversion audit event.
13. Commit once.

Any failure before commit must roll back the User, all transfers, guest status changes, revocations, USER session, replay record, and audit event. Email delivery remains outside the transaction and must never be used as a reason to rerun conversion.

Recovery must use the same principal advisory lock and a compatible lock order. It is read-only with respect to conversion state; it may update only expiry cleanup metadata/ciphertext purge state in a separate bounded cleanup operation.

## 8. Idempotency and conflict rules

| Situation | Required behavior |
|---|---|
| First valid conversion request | Execute once; persist encrypted response atomically |
| Same guest/source token/key retry | Return the original committed response; no side effects, regardless of whether the client still has the original request body |
| Same guest, different key after successful conversion | Reject; do not create another session or replay response |
| Different guest using the same key | No cross-guest lookup or response disclosure |
| Wrong refresh token or wrong key on retry | Generic 401 |
| Correct pair after expiry | Stable recovery-expired response; no credentials returned |
| Ciphertext tampered with or authentication tag invalid | Fail closed; audit safe failure code; no credentials returned |
| Encryption key unavailable | Fail closed; do not downgrade to plaintext |
| Concurrent duplicate initial conversion | Exactly one transaction commits; a concurrent request that already passed the access guard may return the stored response only when it presents the exact original refresh-token/key pair; otherwise reject |
| Conversion transaction rollback | No replay record exists; original guest session and refresh token remain usable |

A retry must never rotate the already-created USER refresh token. Rotation remains exclusively the normal Session refresh operation.

## 9. Client contract

Before the first conversion request, the client must:
1. Generate a high-entropy idempotency key.
2. Persist that key and the existing guest refresh token in platform secure storage as a pending conversion operation.
3. Send the key and refresh token with the conversion request.
4. On confirmed success, atomically replace guest credentials with the returned USER credentials and clear the pending operation.
5. On timeout, connection loss, or ambiguous 5xx, call the recovery endpoint using the same key and original guest refresh token.
6. Clear pending recovery material only after the USER credentials are safely persisted.

Do not persist the guest password in order to support recovery. Do not generate a new idempotency key after an ambiguous outcome. If the client loses both the original refresh token and idempotency key, this recovery mechanism cannot prove ownership; the user must use normal registered-account login.

## 10. Email verification boundary

Conversion success and email delivery are separate outcomes:
- User creation, guest conversion, data transfer, USER session, and deterministic conversion response are one database transaction.
- Email verification token creation/delivery occurs after commit and is not included in the encrypted replay response.
- A delivery failure must not invalidate conversion or delete the replay record.
- A recovery request must not create another email token or send another email.
- The registered user can request verification resend through the authenticated email-resend endpoint.

## 11. Rate limiting, abuse controls, and observability

- Apply database-backed fixed-window rate limits to both initial conversion and recovery endpoints using the shared PostgreSQL GuestConversionRateLimit table. The upsert is atomic across API instances.
- Derive bucket keys with SHA-256 from scoped guest/session or refresh-token hashes and the network risk signal. Never store raw refresh tokens, idempotency keys, or IP addresses in rate-limit rows.
- Enforce independent guest/token and IP buckets; return HTTP 429 after the configured limit. Expire stale buckets after seven days.
- Return generic errors for invalid bearer proofs to reduce account/replay enumeration.
- Emit safe audit events for conversion success, recovery success, recovery mismatch, expired recovery, and cryptographic validation failure. Audit metadata must contain only stable internal IDs and reason codes, never credentials or request contents.
- Monitor replay attempts, expired replay records, decrypt failures, and duplicate conversion conflicts.

## 12. Cleanup and key operations

A Nest lifecycle-managed cleanup worker runs on startup and every 60 seconds on each API instance. It clears `responseCiphertext` when `expiresAt <= now()` and sets `ciphertextPurgedAt`, in bounded batches using `FOR UPDATE SKIP LOCKED` so multiple instances can safely cooperate. It must not delete the replay tombstone. The database-backed rate-limit worker opportunistically removes buckets not updated in the previous seven days.

Encryption and HMAC keys must be independent of JWT signing keys, stored in a secrets manager/environment configuration, and rotated with a documented versioned-key procedure. A key rotation must preserve the ability to decrypt unexpired replay responses during the full replay window. Never rotate away a key while valid ciphertext still depends on it.

## 13. Acceptance criteria

Do not mark Guest Conversion Recovery complete until PostgreSQL-backed integration tests prove:

1. Successful conversion persists exactly one replay row and a decryptable response.
2. Simulated response loss after commit is recovered through the unauthenticated retry endpoint using the original guest refresh token and idempotency key.
3. Recovery returns byte-for-byte equivalent logical response data (same User, Session, access token, refresh token, and expiry values).
4. Recovery works after the guest access token and guest session have been revoked.
5. Recovery does not create or mutate User, UserSession, RefreshToken, XPTransaction, GuestXPTransaction, UserProgress, GuestProgress, CompanionProfile, MatchmakingEntry, or MatchParticipant a second time.
6. Same-key concurrent retries return the same stored result without duplicate side effects.
7. Wrong key, wrong source refresh token, another guest's token, and expired window are rejected as specified.
8. Ciphertext tampering, missing key, malformed ciphertext, and invalid authentication tag fail closed.
9. A failure at every transactional stage rolls back all conversion and replay state.
10. Email delivery failure does not roll back conversion or cause duplicate conversion on retry.
11. Cleanup clears expired ciphertext while retaining the replay tombstone.
12. Logs and audit events contain no raw tokens, passwords, idempotency keys, or decrypted response payloads.

CI must run Prisma format/validation/generation, migration checks, Nest build, lint, unit tests, and PostgreSQL integration tests. Green unit tests alone are insufficient.

## 14. Implementation sequence

1. Owner review and approval of this contract.
2. Additive Prisma model, migration, and environment configuration.
3. Implement source refresh-token validation, exact idempotency proof binding, and PostgreSQL-backed distributed rate limits in Guest Identity.
4. Implement atomic replay persistence/encryption inside conversion transaction.
5. Implement the independent retry endpoint and lock-safe lookup/decryption.
6. Implement bounded ciphertext cleanup and safe audit events.
7. Add deterministic PostgreSQL integration tests for response-loss recovery, concurrency, tampering, expiry, rollback, and no duplicate side effects.
8. Update NEX-BE-002 to reference this contract and remove ambiguity in its existing same-target idempotency statement.
9. Run complete CI and review the resulting commit and workflow evidence.

No production release is authorized by passing this implementation sequence alone; HTTPS, secure client storage, and physical two-device acceptance remain separate release gates.

---

## 14. Definitive recovery outcome when conversion did not commit

The unauthenticated recovery endpoint distinguishes a committed conversion from a request that never committed. After acquiring the same guest-principal advisory lock and the GuestIdentity, source UserSession, and source RefreshToken row locks, it may return HTTP 409 with code `CONVERSION_NOT_COMMITTED` only when all of the following are true:

- The guest identity is still ACTIVE and has no converted user.
- The exact source refresh-token hash resolves to the exact guest session.
- The source session is not revoked or expired.
- The source refresh token is not consumed, revoked, or expired.

This response is read-only apart from a redacted failure audit event. It must not rotate or issue credentials, mutate guest state, or repeat conversion. The client clears only the pending-conversion marker, retains the active guest session, and asks the user to submit the conversion form again. The password is never persisted.

If the guest identity is CONVERTED, recovery continues to require the exact source refresh token and idempotency key and returns the encrypted original response. If neither the active-uncommitted nor committed state can be proven, recovery fails closed; expired replay remains `CONVERSION_RECOVERY_EXPIRED`.

The Android client stores the source refresh token and idempotency key together in the native encrypted session record before the first conversion request. On process restoration, pending conversion recovery runs before normal refresh. The original registration password is memory-only and is never included in the pending record. A successful recovered response atomically replaces the guest refresh token with the registered-user refresh token and clears all pending operation metadata.

---

**End of NEX-BE-012 v1.5**
