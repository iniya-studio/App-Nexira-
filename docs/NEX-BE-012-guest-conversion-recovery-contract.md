# NEX-BE-012 — Guest Conversion Recovery Contract

**Project:** NEXIRA  
**Document:** NEX-BE-012  
**Version:** 1.0  
**Status:** Proposed technical contract — implementation not yet authorized by this document  
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
4. The server binds the idempotency key and a keyed request fingerprint to the guest, source session, source refresh-token record, and target account request.
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

Other fields remain the existing validated `GuestConversionDto` registration fields.

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
1. Hash the presented refresh token and locate the matching RefreshToken record without returning whether an arbitrary token exists.
2. Resolve the immutable source session and guest identity associated with that record.
3. Acquire the same guest-principal advisory lock used by conversion, then follow the documented GuestIdentity → UserSession → RefreshToken row-lock order.
4. Load the unique replay record for that guest and verify source session, source refresh-token hash, idempotency-key hash, expiry, and ciphertext presence.
5. Decrypt and return the stored response only when every check succeeds.
6. Return generic authentication failure for unknown/mismatched token or key. Do not reveal guest IDs, user IDs, account email, or whether a different key has a replay record.
7. Return `CONVERSION_RECOVERY_EXPIRED` when the matching replay record exists but its replay window has expired or its ciphertext has been purged.

The recovery endpoint must never create a User, UserSession, RefreshToken, XPTransaction, profile transfer, matchmaking transfer, or conversion audit success event.

### 4.3 Response

Return the exact original successful conversion response envelope, including the original principal, session, access token, refresh token, expiry fields, and the original email-verification status/delivery result if it was already determined.

If the first HTTP response was lost before email delivery completed, recovery may return the conversion result with email verification still required and a non-success/unknown delivery state. The client must use the registered-account email-resend flow; it must not repeat conversion.

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
  requestFingerprint       String   @db.VarChar(64)
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

Required schema relations must be added to GuestIdentity, UserSession, and User. Validate the final names and relation cardinalities against the current Prisma schema before migration generation.

The unique guest relation guarantees at most one successful conversion replay record per guest. The unique source session and source refresh-token hash bind the replay to the exact credential lineage. Keep a minimal tombstone after ciphertext cleanup so a converted guest cannot be mistaken for an unconverted guest; retention/deletion must follow the approved guest-data retention policy.

The replay record must not store raw refresh tokens, raw idempotency keys, passwords, password hashes, access tokens, or unencrypted response data.

## 6. Cryptographic requirements

### 6.1 Token and key hashes

- Store `SHA-256(rawRefreshToken)` in `sourceRefreshTokenHash`, matching the existing RefreshToken token-hash strategy.
- Store `SHA-256(idempotencyKey)` in `idempotencyKeyHash`.
- Compare hashes in constant time after validating their expected encoding and length.

### 6.2 Request fingerprint

Compute an HMAC-SHA-256 over a canonical, versioned representation of the normalized conversion request (normalized email, normalized username, normalized display name, and submitted password). Use a dedicated `GUEST_CONVERSION_FINGERPRINT_KEY` (32 random bytes or stronger, base64 encoded) stored outside source control and distinct from JWT and response-encryption keys.

The HMAC is only a comparison binding; never persist the canonical request or plaintext password. A repeated conversion request with the same guest and key but a different fingerprint must return Conflict and must not reveal which field differs.

### 6.3 Response encryption

- Use AES-256-GCM with a fresh cryptographically random 96-bit IV for each replay record.
- Store IV, authentication tag, and ciphertext in a versioned, unambiguous encoding.
- Use `REFRESH_RETRY_ENCRYPTION_KEY` only if the deployment confirms it is independently generated and managed as a dedicated 32-byte key. Otherwise provision a separate `GUEST_CONVERSION_REPLAY_ENCRYPTION_KEY`.
- Bind immutable replay metadata as AEAD additional authenticated data (AAD): replay record ID, guest ID, source session ID, source refresh-token hash, target user ID, and idempotency-key hash.
- Include an explicit ciphertext format version to support future key rotation.
- Never log decrypted response data, tokens, keys, ciphertext, or cryptographic errors containing secrets.

If key material is missing, malformed, or unavailable, fail closed. Do not store plaintext response data.

## 7. Transaction and lock contract

The initial conversion transaction must atomically:
1. Acquire the existing guest-principal advisory lock and existing matchmaking/match locks in their established order.
2. Lock and revalidate GuestIdentity and the authenticated UserSession.
3. Lock and validate the supplied source RefreshToken row; confirm it belongs to the exact guest session and is currently active.
4. Create the User and transfer progression, XP ledger, profile, and eligible queue/match ownership exactly once.
5. Mark GuestIdentity CONVERTED and revoke guest sessions and refresh tokens.
6. Create the USER session and its initial refresh-token record.
7. Build the exact response envelope in memory.
8. Create the GuestConversionReplay row and persist the encrypted response using the immutable metadata as AAD.
9. Record the conversion audit event.
10. Commit once.

Any failure before commit must roll back the User, all transfers, guest status changes, revocations, USER session, replay record, and audit event. Email delivery remains outside the transaction and must never be used as a reason to rerun conversion.

Recovery must use the same principal advisory lock and a compatible lock order. It is read-only with respect to conversion state; it may update only expiry cleanup metadata/ciphertext purge state in a separate bounded cleanup operation.

## 8. Idempotency and conflict rules

| Situation | Required behavior |
|---|---|
| First valid conversion request | Execute once; persist encrypted response atomically |
| Same guest, same source refresh token, same key, same fingerprint, before expiry | Return exact original response |
| Same guest and key, changed request fingerprint | 409 Conflict; no side effects |
| Same guest, different key after successful conversion | Reject; do not create another session or replay response |
| Different guest using the same key | No cross-guest lookup or response disclosure |
| Wrong refresh token or wrong key on retry | Generic 401 |
| Correct pair after expiry | Stable recovery-expired response; no credentials returned |
| Ciphertext tampered with or authentication tag invalid | Fail closed; audit safe failure code; no credentials returned |
| Encryption key unavailable | Fail closed; do not downgrade to plaintext |
| Concurrent duplicate initial conversion | Exactly one transaction succeeds; the loser may recover only with the exact original refresh-token/key pair |
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
- User creation, guest conversion, data transfer, USER session, and replay response are one database transaction.
- Email verification token creation/delivery occurs after commit.
- A delivery failure must not invalidate conversion or delete the replay record.
- A recovery request must not create another email token or send another email.
- The registered user can request verification resend through the authenticated email-resend endpoint.
- Do not return a false claim that email was sent if delivery outcome is unknown.

## 11. Rate limiting, abuse controls, and observability

- Apply a distributed rate limit to both initial conversion and recovery endpoints; the existing in-process Map limiter is not sufficient for multi-instance deployment.
- Rate-limit by a privacy-preserving guest/session key and network risk signal; do not expose raw token values in limiter keys or logs.
- Return generic errors for invalid bearer proofs to reduce account/replay enumeration.
- Emit safe audit events for conversion success, recovery success, recovery mismatch, expired recovery, and cryptographic validation failure. Audit metadata must contain only stable internal IDs and reason codes, never credentials or request contents.
- Monitor replay attempts, expired replay records, decrypt failures, and duplicate conversion conflicts.

## 12. Cleanup and key operations

A scheduled cleanup task must clear `responseCiphertext` when `expiresAt <= now()` and set `ciphertextPurgedAt`. It must not delete the replay tombstone as part of routine ciphertext cleanup.

Encryption and HMAC keys must be independent of JWT signing keys, stored in a secrets manager/environment configuration, and rotated with a documented versioned-key procedure. A key rotation must preserve the ability to decrypt unexpired replay responses during the full replay window. Never rotate away a key while valid ciphertext still depends on it.

## 13. Acceptance criteria

Do not mark Guest Conversion Recovery complete until PostgreSQL-backed integration tests prove:

1. Successful conversion persists exactly one replay row and a decryptable response.
2. Simulated response loss after commit is recovered through the unauthenticated retry endpoint using the original guest refresh token and idempotency key.
3. Recovery returns byte-for-byte equivalent logical response data (same User, Session, access token, refresh token, and expiry values).
4. Recovery works after the guest access token and guest session have been revoked.
5. Recovery does not create or mutate User, UserSession, RefreshToken, XPTransaction, GuestXPTransaction, UserProgress, GuestProgress, CompanionProfile, MatchmakingEntry, or MatchParticipant a second time.
6. Same-key concurrent retries return the same stored result without duplicate side effects.
7. Wrong key, wrong source refresh token, another guest's token, changed request fingerprint, and expired window are rejected as specified.
8. Ciphertext tampering, missing key, malformed ciphertext, and invalid authentication tag fail closed.
9. A failure at every transactional stage rolls back all conversion and replay state.
10. Email delivery failure does not roll back conversion or cause duplicate conversion on retry.
11. Cleanup clears expired ciphertext while retaining the replay tombstone.
12. Logs and audit events contain no raw tokens, passwords, idempotency keys, or decrypted response payloads.

CI must run Prisma format/validation/generation, migration checks, Nest build, lint, unit tests, and PostgreSQL integration tests. Green unit tests alone are insufficient.

## 14. Implementation sequence

1. Owner review and approval of this contract.
2. Additive Prisma model, migration, and environment configuration.
3. Implement source refresh-token validation and request fingerprinting in Guest Identity.
4. Implement atomic replay persistence/encryption inside conversion transaction.
5. Implement the independent retry endpoint and lock-safe lookup/decryption.
6. Implement bounded ciphertext cleanup and safe audit events.
7. Add deterministic PostgreSQL integration tests for response-loss recovery, concurrency, tampering, expiry, rollback, and no duplicate side effects.
8. Update NEX-BE-002 to reference this contract and remove ambiguity in its existing same-target idempotency statement.
9. Run complete CI and review the resulting commit and workflow evidence.

No production release is authorized by passing this implementation sequence alone; HTTPS, secure client storage, and physical two-device acceptance remain separate release gates.

---

**End of NEX-BE-012 v1.0**
