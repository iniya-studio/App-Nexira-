# NEX-BE-006 — Synchronized Match Core

**Project:** NEXIRA  
**Document:** NEX-BE-006  
**Version:** 1.0  
**Status:** Implementation contract — synchronized 1v1 product behavior approved  
**Target branch:** `feature/backend-foundation`  
**Related contracts:** NEX-BE-002 Identity & Access; NEX-BE-003 Guest & Session Foundation

## 1. Purpose and scope

Implement the authoritative V1 runtime for competitive matches. The backend, not either client, owns match lifecycle, round timing, question delivery, answer acceptance, adjudication, scoring, and final results.

V1 runtime modes:
- **1v1:** two human participants receive the same question at the same time and answer independently against one shared deadline.
- **1vAI:** one human and one server-controlled AI participant follow the same round lifecycle. The AI response is generated/adjudicated server-side and never trusts a client-supplied AI answer.

The database remains room-ready for V2, but this work does not implement room creation, room membership, room UI, or ROOM runtime.

This contract covers Match Core and its realtime transport. It does not claim production AI credentials, live SMTP, production hosting, payments, or public release. Provider adapters must permit local deterministic testing without paid services.

## 2. Locked product rules

### 2.1 Synchronized 1v1 rounds

1. Both participants are assigned the same persisted Round and Question.
2. The server commits one `startedAt` and one `deadlineAt` for that round.
3. Both clients receive the same round-start event containing those absolute UTC timestamps and the same safe public question payload.
4. Both timers are derived from the same server deadline. Client clocks are display hints only; the server/database clock decides acceptance.
5. Each participant may submit independently, at most once per round.
6. An early answer does not end the round, reveal the opponent's answer, or stop the opponent's timer.
7. The round resolves when every active participant has a final answer or when the shared deadline expires.
8. After resolution, both participants receive the round summary; the next round starts through a server-controlled transition.
9. A reconnecting participant receives the authoritative current snapshot, not a reconstructed client state.

### 2.2 V1 participant policy

- 1v1: exactly two HUMAN participants.
- 1vAI: exactly one HUMAN and one AI participant.
- Persistence and core domain design must not impose a universal two-participant limit; V2 ROOM can use variable capacity.
- The authenticated principal is resolved from the access token/session. Never trust client-supplied user IDs, guest IDs, participant IDs, score, elapsed time, correctness, or AI identity.

### 2.3 Existing scoring contract to preserve

The current competitive match engine defines:
- Correct answer: 10 base points.
- Speed bonus for correct answers: under 3s = +15; under 5s = +10; under 7s = +5; otherwise +2.
- Incorrect answer: 0 points.
- Consecutive no-response penalties: first = -5, second = -5, third = -10 and triggers the existing forfeit rule.
- The existing forfeit transfer is 20 points to the remaining participant.

Backend implementation must port and test this single canonical rule set. The older generic `scoreAnswer(..., timedOut)` helper in the client must not silently override the competitive engine's consecutive-no-response behavior. Reconcile client behavior when wiring it to the backend.

XP and Ranking Points remain separate ledgers. Match Core must not infer a ranking/ELO formula. XP and ranking settlement must be idempotent and use their respective existing persistence models when their policies are implemented.

## 3. Existing persistence baseline

The current Prisma schema already contains the principal match structures:
- `Match`, `MatchParticipant`
- `Round` with `startedAt`, `deadlineAt`, `completedAt`
- `Question` with canonical content, options, answer key, rubric, localized content, time limit, and content/judge versions
- `Answer` with per-participant/per-round uniqueness, judge state, decision, confidence, elapsed time, points, speed bonus, idempotency key, and accepted timestamp
- `MatchResult`
- `UserProgress`, `XPTransaction`, `UserRanking`, and `RankingTransaction`

First implementation must reuse these models and inspect existing SQL CHECK constraints. Do not rewrite the approved initial migration. Add a new migration only if implementation reveals a concrete, documented persistence requirement that cannot be safely represented by the existing schema. Any such migration must be additive and separately tested against PostgreSQL 16.

## 4. Runtime architecture

NestJS modular monolith modules:

- **MatchModule:** REST contracts, orchestration, participant authorization, state transitions, result retrieval.
- **MatchGateway:** authenticated Socket.IO gateway; reuses the same identity/session validation contract as REST.
- **MatchEngine:** pure domain rules for state transitions, round completion, timeout, forfeit, and scoring. No direct network/provider calls.
- **QuestionProvider interface:** generates or retrieves private canonical question packages. Provider-independent; local deterministic implementation for tests.
- **AnswerJudge interface:** judges submitted answers. Exact-option judge for multiple choice; AI semantic judge adapter for free text. Local deterministic fake for tests.
- **MatchPersistence:** Prisma-backed transaction boundary. Domain services must not expose private Question fields to clients.
- **RoundDeadlineProcessor:** processes overdue rounds from persisted `deadlineAt`. A process timer may improve responsiveness, but correctness must not depend on an in-memory timer. On restart, overdue rounds must be recoverable from the database. Concurrent processors must use transactional locking/conditional state changes so a round is finalized once.

Do not add Redis, a message broker, microservices, or Kubernetes for the initial single-server architecture. Database transactions and unique constraints are the source of truth. Before multi-instance deployment, re-evaluate distributed processing, rate limits, and WebSocket fan-out.

## 5. Match lifecycle

Canonical lifecycle:
`WAITING → READY → ACTIVE → COMPLETED`
A match may transition to `CANCELLED` only through an explicit server-side cancellation policy.

1. Create match and participant records transactionally.
2. Confirm both required participants are eligible and joined.
3. Generate/persist the private question package(s) before the corresponding round starts. Do not expose answer keys or grading rubrics.
4. Create the Round and set its shared `startedAt` and `deadlineAt` in a database transaction.
5. Publish `match.round.started` only after the transaction commits.
6. Accept independent participant answers until the shared deadline.
7. Resolve each answer using server-side adjudication and server-derived elapsed time.
8. If all participants have answered, complete the round immediately; otherwise keep it open until the shared deadline.
9. At deadline, persist explicit `NO_RESPONSE` records for participants who did not answer. Do not infer timeout from missing rows.
10. Finalize the round exactly once, update participant scores, and publish `match.round.completed`.
11. Start the next round or complete the match and persist one immutable `MatchResult`.

The exact start timestamp is shared. Socket delivery latency may differ, but it must never create participant-specific deadlines. Clients calculate the visible countdown from the absolute deadline supplied by the server.

## 6. Time and answer integrity

- Use UTC timestamps and the database clock as the authority for answer acceptance.
- Never accept client-reported `elapsedMs` as the scoring source.
- Derive `acceptedAt` and elapsed time from the persisted round start and server/database receipt time.
- Accept an answer only if the round is ACTIVE, the participant belongs to the match, no answer already exists for that participant/round, and the authoritative receipt time is strictly before `deadlineAt`.
- An answer received at or after the deadline is rejected or treated as timeout according to the already-finalized round state; it must never replace a NO_RESPONSE row.
- Define and test the exact deadline boundary consistently (`acceptedAt < deadlineAt` is on time; equality is late).
- A duplicate request with the same valid idempotency key returns the original accepted result without awarding points twice. A conflicting second answer for the same participant/round is rejected.
- Concurrent submissions must be safe. Use a transaction/row lock or equivalent conditional write and retain the unique `(roundId, participantId)` constraint as the final guard.
- Do not reveal an opponent's submitted answer before the round completes.

## 7. Private question and adjudication boundary

The database stores the private canonical question package. A player-specific public DTO may contain:
- question ID and round number
- answer type
- localized prompt and options
- time limit
- shared start/deadline timestamps

It must never contain:
- answer key / correct option ID
- grading rubric or hidden judge instructions
- private canonical answer metadata
- internal provider prompts, credentials, or raw provider diagnostics

For multiple choice, the server maps the submitted option ID to the canonical answer key. For free text, the server calls the AnswerJudge adapter. An AI judge result must be normalized to `CORRECT`, `INCORRECT`, or `UNCERTAIN`, with confidence and version metadata. Provider failure is not an incorrect answer: persist/represent judge failure distinctly and apply a bounded server-side retry/fallback policy. Never let a client choose its own decision or confidence.

Question generation and judging must have timeouts, bounded retries, version metadata, and safe failure handling. The local fake adapters must exercise the same interfaces and domain contracts as real providers.

## 8. REST and realtime contracts

REST (versioned under `/api/v1`):
- `POST /matches` — create/join a supported match according to server matchmaking policy.
- `GET /matches/:matchId` — return an authorized participant's safe snapshot.
- `POST /matches/:matchId/answers` — submit an answer with round ID, answer payload, and idempotency key.
- `POST /matches/:matchId/forfeit` — request forfeit under server policy.
- `GET /matches/:matchId/result` — return the persisted final result to authorized participants.

Socket.IO authenticated events:
- Server → client: `match.ready`, `match.round.started`, `match.answer.accepted` (private to submitting player; no answer content to opponent), `match.round.completed`, `match.completed`, `match.cancelled`.
- Client → server: `match.subscribe`, `match.unsubscribe`, and optionally `match.answer.submit` as a transport wrapper around the same application service used by REST.
- Reconnect: re-authenticate, re-check session and participant membership, then send an authoritative safe snapshot.
- REST and WebSocket answer submissions must share one service and idempotency/concurrency rules.

Event payloads must be versioned and contain identifiers and timestamps needed for recovery. Never trust room/channel names supplied by a client as authorization.

## 9. Security and abuse controls

- Reuse `AccessTokenGuard` and `WsAccessTokenGuard`; revoked/expired sessions must lose access.
- Authorize every read/write against the authenticated principal's actual MatchParticipant row.
- Validate DTO size, answer type, option IDs, text length, round IDs, and idempotency keys.
- Rate-limit match creation and answer attempts; initial in-memory limits are acceptable only for a documented single-process deployment and must be replaced before multi-instance production.
- Do not accept client-side score, winner, correctness, elapsed time, deadline, or match status.
- Do not log raw access/refresh tokens, answer secrets, provider credentials, or hidden answer keys.
- Prevent replay, duplicate scoring, cross-match participant substitution, and stale-round submissions.

## 10. Required test matrix

Unit:
- synchronized start/deadline is identical for all participants
- early answer does not finish round while another participant remains unanswered
- both answers accepted independently
- timeout creates explicit NO_RESPONSE for missing participant(s)
- correct/incorrect/speed/no-response/forfeit scoring
- private answer key and rubric never appear in public DTOs
- judge failure remains distinct from incorrect
- invalid participant, wrong match, stale round, and late answer rejected

Integration (PostgreSQL 16):
- create match, participants, questions, rounds, answers, result in valid transaction order
- concurrent submissions from both participants
- duplicate same idempotency key returns same outcome without duplicate points
- conflicting duplicate answer rejected
- two deadline processors cannot finalize the same round twice
- process restart/recovery finalizes overdue rounds
- reconnect returns authoritative state
- guest and registered principals both authorize only their own participant rows
- XP/ranking settlement is idempotent when wired

Realtime:
- both clients receive same question ID, round ID, startedAt, deadlineAt, and public content
- client delivery latency does not change deadline
- answer submitted by one client does not leak to opponent before completion
- revoked session cannot continue through an existing socket
- disconnect/reconnect during active round does not pause or extend the deadline

Quality gates:
- Prisma validate/generate
- PostgreSQL migration deploy
- Nest build
- unit and integration tests
- ESLint
- manual two-client 1v1 verification against a local backend
- manual 1vAI verification with deterministic fake AI adapter

## 11. Implementation sequence

**Phase A — Domain and persistence:** MatchEngine, MatchModule, DTOs, transaction-safe match/round/answer/result services, deterministic question/judge adapters, unit and PostgreSQL integration tests.

**Phase B — Realtime:** authenticated MatchGateway, shared round-start events, safe answer acknowledgements, round completion events, reconnect snapshots, socket tests.

**Phase C — AI provider integration:** real question generation and semantic judge adapters behind provider-independent interfaces; paid API credentials are not required for A/B development. Live provider/inbox tests are pre-release gates.

**Phase D — Progression and client integration:** idempotent XP settlement, ranking integration only after the ranking policy is approved, then replace the local client adapter with the backend API/WebSocket adapter and verify both clients.

Do not mark Match Core complete after build/CI alone. Completion requires the full applicable test matrix and a manual two-client synchronized match. No merge to `integration` or `main` without explicit owner approval.

## 12. Known release/deployment gates

- Production PostgreSQL and secrets configuration.
- Real AI provider credentials, model selection, cost limits, and load/timeout tests.
- WebSocket production routing and monitoring.
- Multi-instance coordination if deployment grows beyond one application process.
- Client secure credential storage and end-to-end integration.
- Email verification frontend and live SMTP verification remain separate release gates.
- Final session/refresh lifetime values and production rate limits.
- Ranking formula remains unapproved; do not invent it.
