# NEX-BE-006 — Match Core & Synchronized Round Contracts

**Project:** NEXIRA  
**Document:** NEX-BE-006  
**Version:** 1.0  
**Status:** Owner-approved product decision; implementation contract  
**Target branch:** `feature/backend-foundation`  
**Scope:** V1 match lifecycle, synchronized 1v1 rounds, server-authoritative answers and scoring, and the 1vAI extension boundary.

---

## 1. Purpose

Define the server-side match contract before implementing the Match module. The backend is the sole authority for match state, round timing, answer acceptance, adjudication, scoring, and final results.

This document does not authorize production deployment, payment integration, or merging into integration/main.

## 2. Approved V1 match modes

- **1v1:** two human participants.
- **1vAI:** one human participant and one AI participant.
- The persistence model remains participant-count flexible for future room matches. V1 mode policies enforce exactly two participants for these two modes.
- V2 rooms remain outside this runtime implementation.

## 3. Synchronized 1v1 — owner-approved behavior

Both human participants receive the same question for a round and answer independently within the same server-defined time window.

1. The server creates or activates one Round and selects one canonical Question for that round.
2. The server records `startedAt` and `deadlineAt`. The deadline is derived from the server clock and the configured question time limit.
3. Both participants receive the same public question payload. Localized presentation may differ by participant language, but canonical question identity, option IDs/order, answer key, rubric, and time window are shared.
4. Each participant may submit at most one answer for the round.
5. A submission is accepted only if the authenticated principal is a participant in this match, the round is active, the participant has not already submitted, and the server receives the submission before the deadline.
6. The server records its own acceptance timestamp. Client-reported elapsed time is informational only and MUST NOT determine answer eligibility, speed bonus, or score.
7. The opponent's answer, correctness, confidence, and interim score are not disclosed before the round is finalized.
8. The round finalizes when all required participant outcomes exist or the server deadline is reached and missing outcomes are recorded as `NO_RESPONSE`.
9. Scoring and round advancement are computed by the backend. The client cannot submit points, speed bonuses, winner IDs, or final results.

A participant who submits early waits for the shared round to finish; their answer is not revealed to the opponent. Both clients receive the finalized round summary after the server commits it.

## 4. Time and concurrency rules

- Server/database time is authoritative. Never trust a client clock.
- Use a single persisted `startedAt` and `deadlineAt` per round; do not create participant-specific deadlines for synchronized 1v1.
- The deadline boundary is exclusive: a submission with server acceptance time at or after `deadlineAt` is late.
- Concurrent duplicate submissions must produce at most one persisted answer per participant per round. Enforce this with the existing database unique constraint on `(roundId, participantId)` and transaction-safe conflict handling.
- A retry using the same idempotency key must return the original outcome without creating a second answer or score event. Reuse of the same key with a different payload must be rejected.
- A late submission must not overwrite a timeout result.
- Round finalization must be idempotent under concurrent answer submissions and timeout processing. Exactly one finalization/result transition may be committed.
- If the deadline worker is delayed, the submission path must still reject late answers and safely trigger or permit finalization. Correctness must not depend solely on an in-memory timer.
- WebSocket delivery is a notification/transport layer, not the source of truth. Reconnect and state recovery must read authoritative persisted match state.

## 5. Public/private data boundary

The server may persist canonical question content, answer key, grading rubric, and localized variants in `Question`. Player-facing question responses MUST exclude:

- `answerKey`
- `gradingRubric`
- hidden judge prompts or private judge metadata
- opponent response content before round finalization
- unfinalized correctness, confidence, or interim score

The answer key and rubric are available only to trusted server-side adjudication services. Never serialize Prisma Question records directly to clients.

## 6. Answer and adjudication contract

- Multiple-choice answers are validated against the canonical option IDs for the active question.
- Free-text answers are stored as submitted text subject to size and content validation, then passed to the configured judge adapter.
- Judge outcomes are `CORRECT`, `INCORRECT`, or `UNCERTAIN`; provider failure is represented as a judge failure, not silently converted into an incorrect answer.
- The AI judge adapter must be provider-independent. No provider-specific SDK contract may leak into Match domain logic.
- V1 scoring follows the approved scoring policy already used by the client-side reference engine, but the server implementation is authoritative. Any unresolved scoring policy must be documented and approved before it is locked; do not invent a ranking/ELO formula.
- Speed bonus is calculated from server-accepted timing relative to the shared round start, not client-supplied elapsed time.
- A timeout/no-response is a distinct persisted answer status, not an absent row.

## 7. 1vAI boundary

The same server-authoritative round lifecycle applies to 1vAI. The AI participant's answer is produced by a server-side AI opponent strategy/service, not by client code or a deterministic client preview. AI response timing must be measured/controlled by the server and must not expose private answer data.

The existing client-side scripted opponent is a preview implementation only; it is not accepted as the production AI opponent.

## 8. Existing persistence structures to reuse

The current Prisma schema already provides:

- `Match`, `MatchParticipant`
- `Round` with `startedAt`, `deadlineAt`, and `completedAt`
- `Question` with canonical content, answer key, rubric, localized payload, and version fields
- `Answer` with unique `(roundId, participantId)`, status, judge status, decision, confidence, timing, points, speed bonus, and idempotency key
- `MatchResult` with a unique match reference
- `XPTransaction` and ranking transaction foundations

Reuse these structures. Do not rewrite the approved initial migration. Additive schema changes require a demonstrated need and a separate migration.

## 9. Required module boundaries

Create a dedicated Match module with domain/application responsibilities separated:

- **MatchService:** create/start/cancel match and enforce mode/participant policy.
- **RoundService:** create/activate rounds, issue public question views, enforce deadline and finalize rounds.
- **AnswerService:** authenticate participant ownership, validate/accept answer, idempotency and duplicate handling.
- **ScoringService:** pure deterministic scoring policy; no client authority.
- **Question/Judge ports:** interfaces for question generation and semantic adjudication; provider adapters remain replaceable.
- **Realtime Gateway:** later transport adapter that authenticates through the existing access-token/session contract and publishes safe state events. REST/application services remain authoritative.

Avoid circular dependencies between Match, Identity, Session, and future AI modules. Match consumes the authenticated principal contract and never reimplements authentication.

## 10. Minimum verification matrix

Tests must cover:

1. Two participants receive the same canonical question and shared deadline.
2. Localized prompts preserve canonical option IDs and order.
3. Public payload never includes answer key or grading rubric.
4. First answer remains private until round finalization.
5. Both answers accepted inside the shared window.
6. Submission at/after deadline is rejected and timeout is recorded.
7. Client clock/elapsed time manipulation cannot change acceptance or speed score.
8. Duplicate and concurrent submissions create one answer only.
9. Same idempotency key + same payload returns the original result; changed payload is rejected.
10. Answer and timeout race finalizes exactly once.
11. A participant cannot submit to another participant's match.
12. A guest principal can play without registration; registered-only capabilities remain protected.
13. Judge timeout/failure remains distinguishable from an incorrect decision.
14. Reconnect/state recovery returns persisted authoritative state.
15. 1vAI uses a server-side opponent boundary; the client scripted preview is never trusted.
16. Match completion and result creation are idempotent.

Concurrency and deadline tests must run against PostgreSQL in CI, not only mocked repositories.

## 11. Explicit non-goals for this phase

- V2 room runtime/UI.
- Production AI provider credentials or paid inference usage.
- Payment, store purchase processing, and monetization integrations.
- Production deployment and public launch.
- Ranking/ELO formula design unless separately approved.
- Client UI rewrite beyond the API/realtime integration needed by the Match contract.

## 12. Delivery gates

The Match Core phase is complete only when:

- implementation and persistence behavior match this contract;
- unit, PostgreSQL integration, concurrency, and security tests pass;
- CI is green for the exact branch head;
- API and event payloads are documented;
- no unresolved critical correctness/security issue remains;
- the phase report records what is implemented, tested, and still blocked by later client/provider/deployment work.

A successful build alone is not completion.
