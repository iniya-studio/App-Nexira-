# NEX-BE-007 — Match Entry & Synchronized Round Foundation

**Project:** NEXIRA  
**Version:** 1.2  
**Status:** Initial implementation in progress; not a playable match release  
**Target branch:** `feature/backend-foundation`  
**Related contract:** NEX-BE-006 Match Core & Synchronized Round Contracts

## 1. Implemented scope

The current backend branch contains:

- Authenticated creation of a persisted 1vAI match shell.
- Safe match summary retrieval for an authenticated participant.
- Internal first-round/next-round activation from a trusted server-generated question package.
- PostgreSQL row locking for per-match round transitions.
- Database-derived `startedAt` using `clock_timestamp()` and one shared `deadlineAt`.
- Canonical question persistence and participant-specific localization that preserves canonical option IDs and order.
- A public question projection that does not select or expose `answerKey` or `gradingRubric`.

The AI participant row remains a persistence placeholder. It is not a functioning AI opponent.

## 2. Authenticated Match API

### Create a 1vAI match

- **Method:** `POST`
- **Path:** `/api/v1/matches/ai`
- **Body:** empty
- **Authentication:** existing access-token/session guard

The server creates a `WAITING` match with one HUMAN participant derived from the authenticated principal and one AI placeholder participant.

### Read a match summary

- **Method:** `GET`
- **Path:** `/api/v1/matches/:matchId`
- **Authentication:** existing access-token/session guard

Only a participant can retrieve the summary. Non-members receive `404 Not Found`. The response omits participant identity IDs, answer content, and scores.

## 3. Internal round activation

`RoundService.startNextRound(matchId, generatedQuestion)` is a trusted application-service operation, not a public HTTP endpoint.

The question package is expected to come from the future provider-independent AI Question Generator port. This service:

1. Validates the generated question package and canonical multiple-choice option IDs.
2. Locks the Match row in PostgreSQL before checking lifecycle state.
3. Enforces exactly two active participants and the V1 HUMAN/AI composition for the selected match mode.
4. Requires the first match round to be in `WAITING` or `READY`; later rounds require an ACTIVE match and a finalized previous round.
5. Uses the database clock to establish one `startedAt` and one shared `deadlineAt`.
6. Persists the private Question package, creates the Round, and advances the Match in one transaction.
7. Rejects duplicate/concurrent starts and invalid state transitions.

Question localization uses a `localized[language]` object with a `prompt` string and an optional `options` map keyed by canonical option ID. Missing translations fall back to canonical content. The public question query selects only public question fields.

## 4. Verification added

- Unit tests for shared database-derived deadlines and match lifecycle checks.
- Unit tests for V1 participant composition and invalid generated question packages.
- Unit tests for language fallback and preservation of canonical option IDs/order.
- Unit tests that assert private grading fields are not selected or returned.
- PostgreSQL integration tests for persisted question/round creation, localized public projection, and concurrent round-start attempts.

These tests are present in the branch but have not yet been confirmed green by CI on the current head.

## 5. Not yet implemented

- 1v1 matchmaking and the public match creation/pairing API.
- A real AI Question Generator provider; current round service accepts its trusted output.
- Server-side AI opponent strategy.
- Answer submission, adjudication, idempotency, and duplicate-answer protection.
- Shared-deadline timeout processing and explicit `NO_RESPONSE` persistence.
- Scoring, round finalization, match completion, result/history APIs.
- XP/ranking settlement and realtime events/reconnect recovery.
- Full PostgreSQL concurrency/security matrix and end-to-end two-client verification.

Do not describe the current backend as a playable 1v1 or 1vAI game. Completion remains governed by the NEX-BE-006 delivery gates.
