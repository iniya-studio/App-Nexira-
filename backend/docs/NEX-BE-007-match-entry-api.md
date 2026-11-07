# NEX-BE-007 — Match Entry API (Initial Slice)

**Project:** NEXIRA  
**Version:** 1.0  
**Status:** Implemented initial API slice; not a playable match release  
**Target branch:** `feature/backend-foundation`

## 1. Scope

This document describes the first authenticated Match API slice. It creates a persisted 1vAI match shell and allows a participant to retrieve its safe summary.

This slice does **not** yet start a round, generate a question, run an AI opponent strategy, accept answers, judge responses, score a round, or complete a match. A created match remains `WAITING` until the round lifecycle is implemented.

## 2. Authentication

Both routes require the existing access-token/session guard:

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

## 5. Current limitations and next gates

- Matchmaking and the public 1v1 creation route are not implemented.
- Match start and synchronized Round creation are not implemented.
- Question generation and question localization are not implemented.
- The server-side AI opponent and AI judge adapters are not implemented.
- Answer submission, deadline processing, scoring, finalization, history, and realtime delivery are not implemented.
- PostgreSQL persistence/ownership integration tests are included for this initial slice; the full concurrency matrix remains a later gate.

Do not describe this API slice as a playable 1vAI experience. The phase is complete only after the NEX-BE-006 delivery gates are satisfied.
