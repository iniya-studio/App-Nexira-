# NEX-BE-007 — Match Entry API & Initial Lifecycle Slice

**Project:** NEXIRA  
**Version:** 1.1  
**Status:** Initial implementation in progress; not a playable match release  
**Target branch:** `feature/backend-foundation`

## 1. Scope

This document describes the first authenticated Match API slice and the initial internal lifecycle services.

Implemented:
- Create a persisted 1vAI match shell.
- Retrieve a safe match summary for an authenticated participant.
- Internal service entry point to create a 1v1 match from two authenticated principals. It is not exposed as a public route until matchmaking and pairing rules are implemented.
- Internal first-round activation against an already persisted Question, using PostgreSQL `clock_timestamp()`, a conditional match-state claim, and a serializable transaction.

Not yet implemented:
- Public question generation/selection and localization.
- Public delivery of a safe question payload.
- Answer submission, judging, scoring, timeout processing, round finalization, match completion, and realtime delivery.
- A server-side AI opponent strategy. The AI participant row is currently only a persistence placeholder.

A created match remains `WAITING` until a trusted server-side flow invokes the internal first-round operation. Do not describe the current slice as a playable 1vAI or 1v1 experience.

## 2. Authentication

The HTTP routes require the existing access-token/session guard:

`Authorization: Bearer <access-token>`

Registered users and active guest identities are supported. The authenticated principal is derived from the validated session; caller-supplied user IDs, guest IDs, participant IDs, or ownership fields are not accepted.

## 3. Create a 1vAI match

- **Method:** `POST`
- **Path:** `/api/v1/matches/ai`
- **Body:** empty
- **Success:** `201 Created`

The server creates one `Match` in `WAITING` state with exactly two participants: the authenticated HUMAN principal and one AI participant placeholder. The AI participant row is not evidence that the server-side AI opponent is implemented.

Example response:

```json
{
  "id": "match-uuid",
  "mode": "ONE_V_AI",
  "status": "WAITING",
  "currentRound": 0,
  "createdAt": "2026-11-08T00:00:00.000Z",
  "startedAt": null,
  "completedAt": null,
  "participants": [
    { "type": "HUMAN", "status": "ACTIVE" },
    { "type": "AI", "status": "ACTIVE" }
  ]
}
```

The response intentionally omits participant identity IDs, scores, questions, answer keys, and judge metadata.

## 4. Read match summary

- **Method:** `GET`
- **Path:** `/api/v1/matches/:matchId`
- **Success:** `200 OK`

The caller must be a participant in the requested match. Non-members receive `404 Not Found`, so the endpoint does not disclose whether another user's match exists.

The response contains match lifecycle metadata and participant types/statuses only. It never returns interim scores.

## 5. Internal first-round activation

`RoundService.startFirstRound(matchId, questionId)` is a trusted server-side service operation, not an HTTP endpoint.

It:
- accepts only V1 modes with exactly two participants and the required HUMAN/AI composition;
- requires a persisted Question with a positive time limit;
- obtains the start instant from PostgreSQL `clock_timestamp()`;
- derives one shared `deadlineAt` from that instant and the Question time limit;
- conditionally claims the match from `WAITING/currentRound=0` to `ACTIVE/currentRound=1`;
- creates round 1 in the same serializable transaction;
- rejects repeated/concurrent starts and maps serialization conflicts to a conflict response.

No client clock or client-selected question is accepted by this operation.

## 6. Verification included in this slice

- Unit tests for guest/user 1vAI creation and internal 1v1 pairing.
- Unit tests for participant-only match reads and score omission.
- Unit tests for participant composition, database-derived deadlines, conditional start, serializable isolation, and invalid time limits.
- PostgreSQL integration tests for guest and registered ownership, synchronized first-round persistence, and concurrent first-round start race.

The tests have been added to the repository, but CI has not yet reported a run for the current branch head. They must be executed before treating this slice as verified.

## 7. Remaining delivery gates

- Matchmaking and public 1v1 creation route.
- Question generation, selection, validation, and safe localized question delivery.
- Server-side AI opponent and provider-independent AI judge.
- Answer submission with server acceptance timestamp, idempotency, and duplicate/race protection.
- Deadline finalization and explicit `NO_RESPONSE` persistence.
- Approved scoring policy, result creation, XP/ranking events.
- Realtime delivery and reconnect/state recovery.
- Full PostgreSQL concurrency/security test matrix and green CI on the exact branch head.

Do not describe this initial slice as a playable match. The phase is complete only after the NEX-BE-006 delivery gates are satisfied.
