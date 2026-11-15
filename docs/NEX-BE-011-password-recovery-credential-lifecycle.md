# NEX-BE-011 — Password Recovery & Credential Lifecycle Contract

**Project:** NEXIRA  
**Document:** NEX-BE-011  
**Version:** 1.0  
**Status:** Approved implementation contract  
**Target branch:** `main`  
**Scope:** Email-based password recovery and authenticated password change  
**Related contracts:** NEX-BE-002 Identity & Access; NEX-FE-002 Profile & Account

## 1. Goal

Complete the missing V1 password lifecycle without weakening the existing guest, session, or external-identity model. Reuse `User`, `AccountCredential`, `UserSession`, `RefreshToken`, and `IdentityAuditEvent`. Add a dedicated password-reset token model; do not reuse email-verification tokens because the two token purposes have different security and lifecycle semantics.

## 2. Password recovery request

- Endpoint: `POST /api/v1/auth/password/forgot`.
- Input: normalized email address.
- Always return the same accepted response for known, unknown, suspended, or otherwise ineligible accounts. Do not disclose account existence.
- Apply configurable abuse limits by source IP and normalized email. Current process-local limits are a development baseline only; shared/distributed enforcement is a production gate.
- For an eligible active account with an email address and configured delivery, create a cryptographically random token with at least 256 bits of entropy.
- Store only SHA-256(token), never the raw token.
- Token expiry defaults to 30 minutes and is configurable.
- A new request invalidates earlier unconsumed reset tokens for that account.
- If delivery is not configured or fails, preserve the generic public response and record a safe audit event. Never return the token in the API response or logs.

## 3. Password reset completion

- Endpoint: `POST /api/v1/auth/password/reset`.
- Input: one-time token and new password (12–128 characters, same baseline policy as registration).
- Validate token hash, expiry, unused state, and active account status.
- Consume the token conditionally inside the same database transaction that updates the credential. Concurrent attempts must result in at most one successful reset.
- Upsert `AccountCredential` so a verified-email Google-only account can establish a password through mailbox ownership proof; do not create or link an external identity as a side effect.
- Set `passwordChangedAt`.
- Revoke every active session and refresh token for the account in that transaction, including the session used to request recovery. The user must sign in again with the new credential.
- Invalidate every other outstanding reset token for the account.
- Record success/failure audit events without token, password, or other secret material.
- Return a generic invalid/expired-token response; never disclose whether an email belongs to an account.

## 4. Authenticated password change

- Endpoint: `POST /api/v1/account/password/change`.
- Require an authenticated USER principal; guests are rejected.
- Require the current password and a valid new password. For accounts without an existing password credential, use the verified-email recovery/setup flow rather than silently bypassing proof of ownership.
- Verify the current password using Argon2id, then update the credential and `passwordChangedAt` atomically.
- Revoke all other sessions and their refresh tokens, while preserving the current session so the user is not unexpectedly logged out on the device performing the change.
- Audit the change and session revocations. Never log credentials.

## 5. Persistence

Add a dedicated `PasswordResetToken` model and additive Prisma migration. Required fields: UUID id, userId, unique tokenHash, expiresAt, consumedAt nullable, createdAt. Add indexes for user/expiry and expiry/consumed state. Use a restrictive/cascading relation consistent with the account retention policy; do not alter historical match, progression, or purchase data.

## 6. Email delivery

Extend the existing provider-independent email delivery service with a password-reset message. The reset URL must be assembled from configured `PASSWORD_RESET_URL`; do not accept a URL from the request. The raw token may appear only in the outbound link. Use HTTPS for production delivery; development custom-scheme links are not a production configuration.

## 7. Required tests

Backend unit and PostgreSQL integration tests must cover:
- Generic response for known and unknown emails.
- No token creation when delivery is unconfigured.
- Token hash-only persistence, expiry, invalidation, and single-use semantics.
- Two concurrent reset attempts: exactly one succeeds.
- Invalid, expired, consumed, and suspended-account tokens fail safely.
- Successful reset creates/updates credential and revokes all sessions and refresh tokens.
- Login succeeds with the new password and fails with the old password.
- Authenticated password change rejects wrong current password and guest principals.
- Password change preserves only the current session and revokes other sessions.
- Audit records contain no raw token or password.

## 8. Explicit non-goals

This contract does not implement Google/Apple native UI, explicit external-identity linking, account deletion/export, production SMTP configuration, or production deployment. Those remain separate identity/release workstreams. Apple Sign-In remains deferred until the iOS release milestone.

## 9. Acceptance gate

Password lifecycle is not complete until migration, unit tests, PostgreSQL integration tests, Backend CI, API/client contract tests, and a manual account-flow acceptance pass. A green build alone is insufficient.
