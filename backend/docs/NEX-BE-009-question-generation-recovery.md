# NEX-BE-009 — AI Question Generation & Technical Recovery

**Project:** NEXIRA
**Version:** 1.0
**Status:** Implemented; PostgreSQL integration and deployment verification are release gates
**Target branch:** `feature/backend-foundation`
**Related contract:** [NEX-BE-008 AI Judge & Server-Side Scoring Contract](./NEX-BE-008-ai-judge-scoring-contract.md)

## 1. Scope

This contract defines the server-owned AI Question Generator for both initial match questions and technical-void replacement questions. Both paths use durable jobs, bounded retries, validated output, duplicate prevention, and readiness-gated shared clocks. It does not change answer adjudication, match settlement, XP, or ranking.

The generator is an internal `QuestionGenerator` port. The OpenAI Responses adapter is a provider implementation, not a dependency of Match or scoring services. It uses strict structured output, an explicit timeout, output validation, and separate configuration from the AI Judge.

## 2. Question package

Every newly persisted question contains:
- category, difficulty, canonical language, answer type, and time limit;
- canonical prompt/options, answer key, grading rubric, and localized content;
- content version, generator version, provider model version, and generation-policy version;
- normalized SHA-256 content fingerprint.

Existing Question rows receive additive `general`/`medium` defaults for category/difficulty. Old questions without a stored fingerprint are normalized and fingerprinted in application code when building an exclusion set.

Multiple-choice questions require 2–8 unique option IDs and an answer key equal to one of them. Free-text questions require no options and a rubric with at least one required concept. Both require non-empty canonical and localized prompts. The returned question must match all requested settings exactly.

## 3. Durable generation jobs

Initial 1vAI and 1v1 match creation inserts the first-question job in the same database transaction as the Match and its participants. The request context snapshots the category (`general`), difficulty (`medium`), first participant's preferred language (or `en` for a guest), free-text answer type, and 30-second limit. Initial jobs have no source round and are eligible while the Match is `WAITING`. A successful initial generation creates round 1 without starting its clock, creates readiness rows (AI is ready automatically; humans are not), and moves the Match to `READY`. The same Ready endpoint starts the shared clock only when every required participant is ready. Exhausted initial generation cancels the still-waiting Match without scores or a result.

## 4. Durable recovery job

`QuestionGenerationJob` is PostgreSQL-backed and has `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, and `CANCELLED` states. Each job records the match, optional source round (null for initial match generation), trigger, typed request context, attempts/max attempts, availability time, lease ID/time, last error code, idempotency key, generated question, and completion time. Initial jobs are created atomically with the Match using the `INITIAL_MATCH` trigger and a match-scoped idempotency key.

A unique source-round constraint and a deterministic idempotency key allow at most one recovery job per technical void. The void transaction also:
1. reverses positive answer-score ledger effects with immutable compensating entries;
2. marks the original round void and completed;
3. changes the Match from `ACTIVE` to `READY`;
4. captures the original question settings and excluded question IDs/fingerprints.

The excluded set covers every question in the Match and prior matches with the exact same participant set. Participant identifiers are used only for the server-side database lookup; no identity or participant data is added to the generator context or provider request.

Workers claim eligible jobs using `FOR UPDATE SKIP LOCKED`, increment attempts, and set a unique lease using the PostgreSQL clock. Provider requests occur only after the claim transaction commits. Results are committed only when the worker still owns a non-expired lease, the Match remains `READY`, and the source is still the current technical void. The worker rechecks the full fingerprint exclusion set before storage.

The attempt limit is three. Retry delays are 1 second and 2 seconds before the final attempt. Expired leases are recoverable; a crashed final attempt is made terminal after lease expiry. Exhausted generation fails the job and changes the Match to `CANCELLED` using the database clock. It does not create a round, alter score, penalize participants, or create a result.

## 5. Replacement round and readiness

On successful generation, the worker stores the Question and creates the next numbered Round without `startedAt` or `deadlineAt`. It creates one `RoundReadiness` row per required participant. AI participants are ready immediately; humans start not-ready.

The replacement question is not served until the round starts. The existing question route returns not found while the replacement has no shared start/deadline. The readiness endpoint authenticates the participant and updates only their own row; repeated Ready requests are idempotent. Human readiness is bounded to 120 seconds from replacement creation; expiration cancels the Match without changing scores or declaring a winner, and the recovery status exposes `READINESS_TIMEOUT`.

When every required participant is ready, one transaction locks the Match, obtains `startedAt` from `clock_timestamp()`, computes the shared deadline from the persisted question time limit, starts the Round, advances `Match.currentRound`, and changes `Match` from `READY` to `ACTIVE`. The old voided Round and its score ledger remain unchanged.

### API

`GET /matches/:matchId/question-recovery`

Returns the caller-authorized recovery job state, source/replacement round IDs, the caller's own readiness, whether all required participants are ready, shared start/deadline timestamps if started, and the last technical error code. It never returns question content, answer keys, grading rubrics, or other participants' identity/readiness records.

`POST /matches/:matchId/rounds/:roundId/ready`

Uses the authenticated principal; request bodies cannot provide participant IDs, timestamps, deadlines, or scores. A cancelled/non-ready Match cannot start a replacement.

## 6. Provider configuration and privacy

Configure these values only in secure server deployment settings:

- `QUESTION_GENERATOR_OPENAI_API_KEY`
- `QUESTION_GENERATOR_OPENAI_MODEL`
- `QUESTION_GENERATOR_OPENAI_BASE_URL`
- `QUESTION_GENERATOR_TIMEOUT_MS`

The generator uses a 12-second default timeout, configurable from 1–30 seconds. Credentials are independent of `OPENAI_API_KEY` used by the AI Judge. Never provide a provider key in client configuration, source code, GitHub, or request payloads.

The provider receives only category, difficulty, language, answer type, time limit, and excluded content fingerprints. Excluded question IDs remain application-side. Network errors, timeouts, HTTP failures, refusal, incomplete responses, malformed structured output, and invalid/duplicate questions have explicit error codes.

## 7. Verification and release gates

Unit coverage includes valid and invalid structured output, provider refusal/incomplete responses, timeout, HTTP/network errors, strict schema use, and identity-data exclusion. PostgreSQL integration coverage exercises job idempotency, exact-match/rematch duplicate prevention, retry/backoff/exhaustion, safe cancellation, stale lease recovery/fencing, concurrent claims, score preservation, participant ownership, and readiness-gated shared clocks.

Before production release, run all migrations and integration tests against PostgreSQL, verify provider credentials and model availability in the deployment environment, and complete operational logging/metrics and two-client verification. No static-question fallback or winner adjudication is permitted when recovery fails.
