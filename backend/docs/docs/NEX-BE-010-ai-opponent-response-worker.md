# NEX-BE-010 — AI Opponent Response Worker Contract

**Project:** NEXIRA  
**Version:** 1.0  
**Status:** Implemented; PostgreSQL CI verified including full multi-round 1vAI lifecycle; awaiting live provider verification  
**Related contracts:** NEX-BE-006 Match Core & Synchronized Round Contracts; NEX-BE-007 Match Entry & Answer Acceptance; NEX-BE-008 AI Judge & Server-Side Scoring; NEX-BE-009 AI Question Generation & Technical Recovery

## 1. Purpose

Define the trusted server-side response path for the AI participant in a V1 `ONE_V_AI` match. The AI opponent is a match participant, not an authenticated human principal. It must never submit through the public human answer endpoint.

## 2. Trust boundary

The provider receives only:
- the canonical question prompt shown to the participant;
- the canonical visible options for multiple-choice questions;
- the answer type needed to format its response.

The provider must never receive `answerKey`, `gradingRubric`, hidden judging data, score state, or participant identity. The worker loads the answer key only inside the trusted server after the provider has returned a validated answer.

The AI response provider has no tools and no authority to mutate match state.

## 3. Durable job lifecycle

A PostgreSQL `AiAnswerJob` is created in the same transaction that persists each generated round for a `ONE_V_AI` match. The job is eligible only after the round has started and the match is active.

The worker:
- claims work with `FOR UPDATE SKIP LOCKED`;
- uses bounded attempts and database-clock-based availability;
- assigns a random lease ID and database lease timestamp;
- recovers stale leases;
- fences stale workers by verifying the current lease ID and lease age while holding the round and job locks;
- persists the answer, score ledger entry, participant score aggregate, and completed job atomically.

The unique `(roundId, participantId)` constraint and answer idempotency key prevent duplicate answers. The unique answer-to-score relation and score idempotency key prevent duplicate scoring.

## 4. Answer adjudication

- Multiple-choice: the provider returns a canonical visible option ID. The server validates that ID and uses the existing deterministic multiple-choice scoring policy.
- Free-text: the answer is persisted as `PENDING` and passed to the existing `AnswerJudgeWorker`. The AI opponent does not judge itself.
- The server records `acceptedAt` and `elapsedMs` using PostgreSQL `clock_timestamp()`; provider latency therefore counts against the AI's response time.

## 5. Deadline and provider failure

Provider calls have a bounded timeout and the job has a bounded retry policy. Provider failure does not extend the round deadline.

At the deadline, the deadline worker:
- cancels outstanding pending/processing AI jobs while holding the round lock;
- persists an explicit AI `NO_RESPONSE` if no AI answer exists;
- applies no human no-response penalty to the AI participant;
- finalizes the round without allowing a late provider response to modify it.

A free-text answer whose judge reaches terminal `FAILED` state does not hold the round open indefinitely; it remains unscored.

## 6. Verification requirements

Automated verification must prove:
1. the Responses API adapter uses strict structured output, sends only visible question data, and handles refusal, incomplete output, malformed results, HTTP errors, timeout, network failure, invalid configuration, and invalid input;
2. initial 1vAI question generation creates exactly one durable AI answer job in the same database transaction as the generated round, with AI readiness set automatically and human readiness left pending;
3. provider input excludes answer key and grading rubric;
4. concurrent workers claim one job and persist one answer/score;
5. stale lease recovery works and stale worker output is fenced;
6. provider failures stop after the configured attempt limit;
7. free-text answers enter the existing judge pipeline;
8. deadline finalization persists AI `NO_RESPONSE`;
9. a late AI response cannot overwrite the deadline result;
10. an end-to-end PostgreSQL integration test completes every configured round of a 1vAI match: initial and subsequent question generation, synchronized readiness/start, AI answer job execution, human answer acceptance, both free-text judge paths, exactly-once score ledger entries, round finalization, next-round scheduling, and final match/result persistence.

The complete lifecycle test uses deterministic test doubles for the question generator, AI opponent provider, and answer judge. It verifies the internal match lifecycle; it does not constitute a live external-provider or client-application test. The complete CI run passed with 32 suites and 168 tests, including the full multi-round lifecycle integration test.

This contract does not authorize changes to the public human answer API or redesign of the existing Match Engine.
