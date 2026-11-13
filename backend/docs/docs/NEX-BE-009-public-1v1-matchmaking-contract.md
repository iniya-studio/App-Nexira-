# NEX-BE-009 — Public 1v1 Matchmaking & Pairing Contract

**Project:** NEXIRA  
**Version:** 1.0  
**Status:** Implementation contract — design baseline  
**Target:** Existing `main` modular monolith  
**Depends on:** NEX-BE-006 Synchronized Match Core; NEX-BE-002 Identity & Access; NEX-BE-003 Guest & Session Foundation  
**Scope:** Public V1 1v1 queue, atomic human pairing, queue lifecycle, and client notification/recovery.

## 1. Objective and boundaries

Expose the existing internal `MatchService.createOneVsOne` capability through a safe public matchmaking flow. Reuse the existing Match, MatchParticipant, question-generation, round, answer, result, identity, and scoring services.

This work MUST NOT redesign Match Core, change 1vAI behavior, rewrite identity/session foundations, implement V2 rooms, or introduce Redis, a broker, microservices, or Kubernetes. PostgreSQL remains the source of truth. Socket.IO is a notification/transport layer only.

1v1 means exactly two HUMAN participants. Both receive the same persisted canonical question, option IDs/order, round start timestamp, and deadline under NEX-BE-006. The server remains authoritative for every match decision.

## 2. Existing baseline and verified gap

Already present:
- `MatchMode.ONE_V_ONE` and flexible `MatchParticipant` persistence.
- Internal `MatchService.createOneVsOne(first, second)`.
- Shared round timing, readiness, answer acceptance, scoring, deadline/finalization and result infrastructure.
- Guest and registered principal authentication.
- Socket.IO/Nest WebSocket dependencies.
- PostgreSQL-backed integration-test infrastructure.

Not yet present:
- Persistent public matchmaking queue.
- Public enqueue/cancel/status API.
- Atomic queue pairing and protection against duplicate active queue entries.
- Authenticated WebSocket match-found notification and subscription/recovery flow.
- Production frontend 1v1 online adapter/UI connection.

## 3. V1 product rules

1. Both guest and registered users may enter public 1v1. Registration is not a prerequisite for playing.
2. A principal may have at most one active matchmaking entry at a time.
3. A principal may not be paired with itself, including multiple sessions belonging to the same underlying user or guest identity.
4. Only compatible entries may pair. Compatibility is exact match on normalized category and selected language for V1. Do not silently change a player's category or language while waiting.
5. Pair the oldest compatible waiting entry first (FIFO within the compatibility group).
6. Pairing creates exactly one match with exactly two HUMAN participants and consumes both queue entries atomically.
7. A player must not receive a match-found result until the pairing transaction commits.
8. If no compatible opponent exists, the player remains WAITING and can cancel or query status.
9. A queue cancellation racing with pairing must have one deterministic winner: either cancellation commits and pairing cannot consume the entry, or pairing commits and cancellation reports that the entry is already matched. Never create an orphan match or leave one entry reusable.
10. A disconnected client does not automatically leave the queue or cancel a committed match. Reconnect must recover state from the server.
11. Match readiness, shared question delivery, round clock, answer acceptance, scoring, and result follow NEX-BE-006 unchanged.
12. Match score, XP, and Ranking remain separate. No ELO/rating-based matchmaking or ranking formula is introduced by this contract.

## 4. Queue persistence

Add a dedicated `MatchmakingEntry` persistence model in an additive migration. Do not overload `Match` with queue state and do not use a client-only or in-memory queue.

Minimum fields:
- UUID primary key.
- Exactly one principal reference: nullable `userId` or nullable `guestIdentityId`.
- Normalized `category` and `language`.
- Status: `WAITING`, `MATCHED`, `CANCELLED`, or `EXPIRED`.
- `queuedAt`, `matchedAt`, `cancelledAt`, `expiresAt` timestamps as applicable.
- Nullable `matchId`, populated only after successful pairing.
- Unique request idempotency key (or equivalent scoped idempotency record) to make enqueue retries safe.
- Optional non-sensitive metadata only; never persist access/refresh tokens.

Database constraints:
- Exactly one of `userId` and `guestIdentityId` is non-null.
- A matched entry must reference its resulting match; non-matched entries must not claim a match.
- A principal can have at most one `WAITING` entry across sessions. Enforce with PostgreSQL partial unique indexes for user and guest identity separately; ordinary Prisma nullable compound uniqueness is not sufficient.
- Index compatible waiting entries by status, category, language, and queue timestamp.
- Add foreign keys with deliberate delete behavior consistent with existing identity retention rules.
- Preserve the approved initial migration. Add a new migration only for this demonstrated requirement.

The exact retention window and expiry duration must be configuration-driven and documented before enabling a cleanup worker. Do not hard-code an arbitrary user-facing timeout.

## 5. Atomic pairing algorithm

Pairing must be transaction-safe under multiple concurrent API requests or workers.

1. Authenticate the caller through the existing access-token/session guard and derive the principal from the verified token. Ignore any client-supplied user, guest, or participant ID.
2. Create or retrieve the caller's idempotent WAITING entry. Validate category/language against server allowlists and normalize before persistence.
3. Attempt to claim the oldest compatible WAITING entry belonging to a different principal.
4. Use PostgreSQL row locking/conditional updates (e.g. `FOR UPDATE SKIP LOCKED`) or an equivalently proven serialization strategy. A read-then-write sequence without locking is forbidden.
5. Lock/claim both entries in a deterministic order, re-check status and compatibility inside the transaction, and transition both entries to MATCHED exactly once.
6. Create the 1v1 Match, exactly two HUMAN MatchParticipant rows, and the initial QuestionGenerationJob in the same transaction. Reuse the existing match/question-generation policy and round count snapshot.
7. Store the resulting `matchId` on both entries and commit.
8. Publish notifications only after commit. If notification delivery fails, the committed match remains recoverable through the status endpoint and reconnect snapshot.
9. A retry of the same enqueue request returns its original queue/match state; it must not create another entry or match.
10. If a transaction fails, neither queue entry may remain MATCHED and no partial match/question job may survive.

Refactor only the minimum existing MatchService transaction boundary needed to create a 1v1 match inside the pairing transaction. Keep the current public/internal method behavior covered by tests. Do not duplicate the match creation, participant mapping, or initial question-job logic in the matchmaking service.

## 6. REST API contract

All endpoints are under `/api/v1` and require the existing AccessTokenGuard unless explicitly stated otherwise.

| Method | Path | Purpose |
|---|---|---|
| POST | `/matchmaking/queue` | Enqueue or return the idempotent existing queue state |
| GET | `/matchmaking/queue/me` | Return the caller's authoritative queue state and matched match summary, if any |
| DELETE | `/matchmaking/queue/me` | Cancel only an entry that is still WAITING |

Request fields for enqueue:
- `category`
- `language`
- `idempotencyKey`

Response states must be explicit and stable:
- `WAITING`: queue entry exists; no opponent assigned.
- `MATCHED`: committed `matchId` and safe match summary available.
- `CANCELLED`: entry was cancelled before pairing.
- `EXPIRED`: server-side expiry policy ended the entry.

Never expose the opponent's principal ID, email, guest ID, session ID, or private account metadata. A matched response may expose only the safe participant presentation fields already allowed by the match snapshot contract.

The queue status endpoint is authoritative. A client must not infer pairing solely from a socket event.

## 7. Realtime notification and recovery

Use the existing Socket.IO dependency and add an authenticated matchmaking/match gateway only after confirming the existing WebSocket authentication guard contract.

Server-to-client events:
- `matchmaking.queue.updated` — own queue state only.
- `matchmaking.match.found` — committed match ID and safe match summary for the two authorized participants.
- Existing NEX-BE-006 match lifecycle events — shared round start, private answer receipt, round completion, match completion/cancellation.

Client-to-server:
- Subscribe/unsubscribe to the caller's authorized matchmaking or match updates.
- No client-selected socket room name is an authorization mechanism.

Security:
- Authenticate socket connection using the existing access-token/session validation behavior.
- Re-check participant ownership on every subscription.
- Derive server-side socket rooms from verified principal/match membership.
- A revoked/expired session must lose socket access.
- Never broadcast one player's answer content or private state to the opponent.
- Notifications are at-least-best-effort; REST status/snapshot recovery is the source of truth.
- Reconnect must re-authenticate, query queue/match state, and rejoin only authorized rooms. A missed event must not strand the player.

## 8. Abuse, limits, and failure handling

- Apply server-side rate limits to enqueue/cancel/status polling and malformed requests. A single-process in-memory limiter is acceptable only for documented single-instance development; production multi-instance needs a shared strategy.
- Reject invalid category/language, oversized values, malformed idempotency keys, and repeated abusive enqueue attempts.
- Do not reveal queue depth, opponent identity, or other players' queue metadata.
- Do not allow a client to cancel a MATCHED entry to invalidate a committed match.
- Handle stale WAITING entries with a bounded cleanup process based on configured expiry.
- Log queue/pairing state transitions with correlation IDs, but never credentials or sensitive principal data.
- Socket downtime, app backgrounding, and network retries must not corrupt queue state.

## 9. Required verification

Unit tests:
- category/language normalization and compatibility.
- FIFO selection among compatible entries.
- no self-pairing across duplicate sessions.
- guest and registered principal mapping.
- enqueue idempotency and duplicate active-entry rejection.
- cancellation only while WAITING.
- safe public queue/match response serialization.

PostgreSQL 16 integration tests:
- two compatible principals enqueue and pair into exactly one match.
- incompatible category or language remains waiting.
- three or more principals pair without duplicate consumption.
- concurrent pairing workers cannot consume one entry twice.
- enqueue retry cannot create duplicate queue entries or matches.
- cancellation-versus-pairing race has exactly one valid outcome.
- transaction failure rolls back both queue transitions, match, participants, and question job.
- one user with multiple sessions cannot pair against itself.
- guest-to-registered conversion/revocation behavior follows current identity constraints.
- reconnect/status recovery returns the committed match after a missed notification.
- paired match enters the existing shared readiness/question lifecycle without changing 1vAI behavior.

Realtime tests:
- only the two authorized participants receive match-found and match lifecycle events.
- forged room IDs and unauthorized subscriptions are rejected.
- revoked sessions cannot continue through an existing socket.
- disconnect/reconnect does not change queue or match state.

Quality gates:
- Prisma format/validate/generate.
- Additive migration deploy against PostgreSQL 16.
- Nest build and ESLint.
- Full Backend unit/integration suite.
- Android/Frontend tests and build after client integration.
- Manual two-device 1v1 verification before enabling the production entry point.

## 10. Implementation sequence

**A — Persistence and queue service:** schema/migration, DTOs, queue lifecycle, atomic pairing, and PostgreSQL race tests.

**B — REST and authenticated realtime:** queue endpoints, WebSocket authentication/subscription, committed match-found notification, and reconnect snapshot.

**C — Frontend integration:** online matchmaking adapter, Quick Battle/1v1 entry, waiting/cancel/reconnect states, then reuse the existing online match lifecycle. Do not simulate an opponent or local result in production.

**D — End-to-end acceptance:** two real clients, guest and registered identities, category/language compatibility, concurrent queue load, cancellation race, reconnect, and complete shared-question match.

No production 1v1 enablement until all applicable gates pass. 1vAI remains unchanged and independently testable.


## 11. Implementation notes — 2026-11-14

Implementation is in progress on `feature/public-1v1-matchmaking`; this section records code that has been added, not a release approval.

- Additive migration: `20261114000100_add_public_1v1_matchmaking_queue`.
- Persistent `MatchmakingEntry` rows include principal ownership, category/language, idempotency key, timestamps, expiry and optional match reference. PostgreSQL partial unique indexes enforce one WAITING entry per user or guest across all categories; principal-history indexes support status recovery.
- Enqueue uses a compatibility-bucket advisory transaction lock, then a principal-scoped lock, rejects a second queue while a prior match is active, and selects the oldest compatible opponent with `FOR UPDATE SKIP LOCKED`. Match creation, initial question job creation and both queue transitions share one Prisma transaction.
- Queue REST routes are `POST /api/v1/matchmaking/queue`, `GET /api/v1/matchmaking/queue/me`, and `DELETE /api/v1/matchmaking/queue/me`.
- Queue expiry is configurable with `NEXIRA_MATCHMAKING_QUEUE_TTL_SECONDS` (default 300 seconds). Expired rows are marked during compatible enqueue and principal status recovery; there is no background cleanup worker.
- Enqueue rate limiting is database-backed and principal-scoped with `NEXIRA_MATCHMAKING_MAX_ENQUEUES_PER_MINUTE` (default 10 per 60 seconds). Both settings must be reviewed before production rollout.
- Socket.IO namespace `/matchmaking` exposes authenticated `matchmaking.subscribe` / `matchmaking.unsubscribe` and emits `matchmaking.match.found` only after transaction commit. The gateway rechecks each receiving socket's active session before emitting.
- Guest conversion transfers WAITING queue ownership and any already-paired, still-active 1v1 participant/queue ownership to the newly created user in the same conversion transaction. Completed historical matches remain attached to the guest identity.
- The production client has a matchmaking REST adapter, stable enqueue idempotency, queue waiting/cancel UI, status polling, match handoff and cold-reconnect recovery through `GET /queue/me`. The browser/Android client currently uses REST polling; a Socket.IO client subscription is not yet wired.
- Backend CI passed: Prisma format/validation/client generation, PostgreSQL 16 migration deploy, NestJS production build, 36 suites / 194 tests and ESLint. Android CI passed frontend tests, web/Android build, APK verification and upload. The APK artifact is `NEXIRA-Android-debug` (6,288,672 bytes) from commit `24434b9d3386ad137758f24f8f725b96591c1e7b`.
- Manual two-device acceptance, network interruption/cold-process recovery, production HTTPS deployment, XP/Ranking integration, and Socket.IO client subscription remain pending. The current client uses REST status polling.

**Current gate:** automated Backend/Android CI and PostgreSQL 16 migration verification are green. Do not merge or enable production 1v1 until the two-device end-to-end acceptance checklist in section 9, XP/Ranking integration, and production HTTPS/API configuration are completed.
