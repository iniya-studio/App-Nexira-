# NEX-BE-007 — Match Entry, Synchronized Questions & Answer Acceptance

**Project:** NEXIRA  
**Version:** 1.4  
**Status:** Match entry, round start, safe question delivery, and answer acceptance implemented and CI-verified; not a playable release  
**Target branch:** `feature/backend-foundation`  
**Related contract:** NEX-BE-006 Match Core & Synchronized Round Contracts

## 1. Implemented scope

The backend currently contains:

- Authenticated creation of a persisted 1vAI match shell and participant-only match reads.
- Internal 1v1 aggregate creation for trusted matchmaking; no public matchmaking route yet.
- Trusted first/next-round activation from a generated question package.
- PostgreSQL row locking for per-match round transitions and per-round answer submissions.
- Database-derived shared `startedAt` and `deadlineAt` values.
- Participant-specific localized question delivery while preserving canonical question and option IDs.
- Safe question selection that excludes `answerKey` and `gradingRubric`.
- Authenticated answer submission with server-derived acceptance time, one-answer-per-participant enforcement, and idempotent retry handling.
- A minimal answer receipt that reveals neither response correctness nor score.

The AI participant row remains a persistence placeholder. It is not a functioning AI opponent, and the current question package is supplied by a trusted caller; a real AI Question Generator provider is still required.

## 2. Authenticated Match API

### Create a 1vAI match

- **Method:** `POST`
- **Path:** `/api/v1/matches/ai`
- **Body:** empty
- **Authentication:** access-token/session guard

Creates a `WAITING` match with the authenticated HUMAN principal and one AI placeholder participant.

### Read match summary

- **Method:** `GET`
- **Path:** `/api/v1/matches/:matchId`
- **Authentication:** access-token/session guard

Only a participant can retrieve the summary. Non-members receive `404 Not Found`. Participant identity IDs, answer content, and scores are omitted.

## 3. Synchronized round and question delivery

`RoundService.startNextRound(matchId, generatedQuestion)` is an internal trusted operation, not a public HTTP endpoint.

It validates the generated question package, locks the Match row, enforces the V1 participant composition, uses PostgreSQL `clock_timestamp()`, persists one canonical Question, creates the Round, and advances the Match in one transaction. All participants in the round share the same persisted `startedAt` and `deadlineAt`.

### Read the question

- **Method:** `GET`
- **Path:** `/api/v1/matches/:matchId/rounds/:roundId/question?language=fa`
- **Authentication:** access-token/session guard

Only a participant can read the question. The response contains the canonical question identity, localized prompt/options, stable option IDs, and the shared timing fields. The query does not select `answerKey` or `gradingRubric`. Missing translations fall back to canonical content.

## 4. Answer submission

- **Method:** `POST`
- **Path:** `/api/v1/matches/:matchId/rounds/:roundId/answers`
- **Authentication:** access-token/session guard

Request body:

```json
{
  "responseText": "B",
  "idempotencyKey": "client-generated-unique-key"
}
```

The service:

1. Locks the Round row in PostgreSQL before checking answer state.
2. Verifies that the caller is an active HUMAN participant in the match.
3. Accepts only V1 `ONE_V_ONE` and `ONE_V_AI` modes.
4. Replays the original receipt when the same idempotency key and payload are retried; rejects key reuse with a different payload.
5. Enforces one answer per participant per round, including concurrent duplicate submissions.
6. Uses PostgreSQL `clock_timestamp()` for `acceptedAt` and derives `elapsedMs` from the persisted round start.
7. Applies an exclusive deadline boundary: an answer is accepted only when `acceptedAt < deadlineAt`; at or after the deadline it is rejected.
8. Persists the answer with `judgeStatus=PENDING`, `points=0`, and `speedBonus=0`.

The response is a receipt containing answer ID, round ID, server acceptance time, and elapsed time only. It does not reveal correctness, judge reasoning, answer content, or score. No participant can read another participant's submitted answer through these routes.

## 5. Verification

CI run [#42414082109](https://github.com/iniya-studio/App-Nexira-/actions/runs/42414082109) validated implementation commit `56076519e99f69caf2096f8c3ea57b5356065c43`:

- 15/15 Jest suites passed.
- 64/64 tests passed.
- Prisma formatting, validation, client generation, and migration deployment passed.
- NestJS production build passed.
- ESLint passed.

PostgreSQL integration coverage includes synchronized 1v1 question identity/deadline, localized views for both participants, independent answer acceptance, idempotent retry, duplicate submission race, and late-answer rejection.

## 6. Not yet implemented

- Public 1v1 matchmaking and pairing API.
- Real provider-independent AI Question Generator adapter and live AI question generation.
- Server-side AI opponent strategy and its answer generation.
- Provider-independent AI Judge, including semantic/equivalent free-text evaluation.
- Deadline worker/finalizer and explicit `NO_RESPONSE` persistence.
- Round reveal/finalization and match completion.
- Approved scoring policy, result/history APIs, XP/ranking settlement.
- WebSocket events, reconnect recovery, and end-to-end client integration.
- Full answer-vs-timeout and judge-failure concurrency/security matrix.
- Manual two-client gameplay verification.

Do not describe the current backend as a playable 1v1 or 1vAI game. Completion remains governed by the NEX-BE-006 delivery gates.
