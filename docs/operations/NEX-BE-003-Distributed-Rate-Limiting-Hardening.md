# NEX-BE-003 — Distributed Rate-Limiting Hardening

- **Status:** Required before public production traffic
- **Current state:** Temporary in-process protection only
- **Scope:** Guest creation, guest-to-user conversion, and email-verification resend
- **Architecture:** Preserve the existing NestJS modular monolith; introduce a shared atomic limiter adapter

## 1. Current limitation

The current limiters use process-local JavaScript Maps. They provide useful single-instance development protection, but their counters:
- are not shared across multiple Backend instances;
- reset on process restart or deployment;
- can be bypassed by distributing requests across instances;
- are not durable operational controls.

These limits must not be treated as production-grade abuse prevention.

## 2. Required production behavior

Before public production traffic, replace process-local counters for these flows with a shared, atomic, TTL-backed limiter:

1. Guest creation: key by a normalized client network identity, using only trusted proxy configuration.
2. Guest conversion: key by authenticated guest identity; apply an additional network-level abuse control where appropriate.
3. Email-verification resend: key by registered user identity, with network-level protection as a secondary control.

The limiter operation must be atomic across all application instances. A Redis-backed implementation is the expected default, behind a provider-neutral application interface so infrastructure can be changed without rewriting domain services.

## 3. Security and reliability requirements

- Apply limits before expensive password hashing or email delivery.
- Use bounded key cardinality and TTL-based expiry.
- Never use raw email addresses, passwords, access tokens, refresh tokens, or other secrets as limiter keys.
- Use a keyed hash for identifiers if keys may be visible in shared infrastructure.
- Return a stable HTTP 429 response and, where practical, a retry hint.
- Define explicit outage behavior. For account conversion and verification-resend abuse controls, fail closed when the shared limiter is unavailable; do not silently fall back to per-instance Maps in production.
- Keep development/test behavior deterministic and allow an in-memory adapter only in non-production environments.
- Emit metrics for allowed, blocked, and backend-error outcomes without logging secrets or personal payloads.

## 4. Delivery and acceptance criteria

This hardening is a production-readiness task, not a reason to redesign identity or session flows now.

It is complete when:
- all Backend instances share the same counters;
- concurrent requests cannot exceed the configured limit through race conditions;
- counters survive application restarts for their configured TTL;
- tests cover threshold, window expiry, concurrent increments, key isolation, and limiter outage behavior;
- guest creation, guest conversion, and email-verification resend use the shared adapter;
- production configuration refuses to start with the in-memory adapter selected.

## 5. Current implementation boundary

Keep the existing in-memory limiter as a temporary local/test safeguard until the shared adapter is implemented and verified. Do not change the guest-conversion transaction, session model, Match Engine, scoring, or ranking as part of this hardening task.
