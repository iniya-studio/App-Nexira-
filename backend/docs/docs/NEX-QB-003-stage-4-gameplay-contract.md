# NEX-QB-003 — Stage 4 Gameplay & Judging Contract

Status: Approved implementation contract; implementation in progress
Target ref: `main`
Prerequisites: NEX-QB-002 Stages 1–3 verified; NEXIRA product delivery dependencies recorded in `docs/NEXIRA-PRODUCT-DELIVERY-DEPENDENCIES.md`

## 1. Scope and hard boundaries

Stage 4 implements the actual ten-round Quick Battle runtime:
- Publish a generated question to its owner.
- Start the official answer clock using PostgreSQL time.
- Accept and persist one answer per round.
- Judge free-text answers through a dedicated Quick Battle worker and the shared provider-agnostic AI Judge port.
- Restore the persisted match and active-round state after disconnect/reconnect.
- Finalize a round and make the next generated round eligible for publication.

All state transitions and persistence belong to the dedicated Quick Battle aggregate and tables. Do not route Quick Battle through `Match`, `Round`, `Answer`, the existing Match workers, `MatchSettlementService`, standard XP, or standard Ranking.

No change to 1v1 or 1vAI behavior, schema semantics, worker eligibility, APIs, scoring, settlement, or ranking is permitted as part of this stage.

## 2. Round publication and authoritative clock

A dedicated publisher claims a Quick Battle match transactionally and locks its `QuickBattleMatch` row.

A round is publishable only when:
- The match is in `READY` for its first round, or `ACTIVE` after the prior round is completed.
- The next sequential round exists and has a generated `questionId`.
- The previous round, if any, is completed and not technically voided.
- The match has not completed, been voided, or been cancelled.

The publisher uses one PostgreSQL `clock_timestamp()` value to set `QuickBattleRound.startedAt` and `deadlineAt = startedAt + question.timeLimitSeconds`. It advances `currentRound` and moves the first round from `READY` to `ACTIVE` in the same transaction. Repeated polling must not reset an existing clock or publish the same round twice.

Question generation latency never consumes answer time. If the next question is not ready, the match remains recoverable and no answer clock starts.

The publisher persists the question's public view only through API projection. Never return `answerKey`, `gradingRubric`, internal prompt instructions, or judge-only fields.

## 3. Answer acceptance

Endpoint contract:
- `POST /quick-battles/:matchId/rounds/:roundNumber/answers`
- Request contains `responseText` and a client-generated `idempotencyKey`.
- The authenticated USER/GUEST principal must own the match.
- Accept one immutable answer per round.
- Validate response length and supported answer type.
- Lock the match and round in a consistent order shared by all Quick Battle transitions.
- Use PostgreSQL `clock_timestamp()` as `acceptedAt`; reject an answer at or after `deadlineAt`.
- Persist elapsed time from the persisted `startedAt`; never trust client time.
- An exact retry with the same idempotency key and same owner/round/content returns the original receipt. Reuse of a key for a different request is a conflict.
- A second answer with a different key is rejected; accepted content cannot be overwritten.

Quick Battle answers do not receive points in Stage 4. `points` remains unset. Do not invoke the existing standard scoring policy.

## 4. Dedicated AI Judge

Reuse only the provider-agnostic `FreeTextAnswerJudge` port and its configured adapter. Quick Battle owns its own judge queue, worker, leases, retry policy, and persistence transitions.

The worker must:
- Claim only `QuickBattleAnswer` rows for active, non-voided Quick Battle rounds.
- Build judge input from the immutable match language and the matching localized question prompt, expected answer, and grading rubric.
- Treat player response text as untrusted data.
- Use bounded attempts, a lease identifier, stale-lease recovery, and lease fencing.
- Persist decision, confidence, reason code, provider/model/policy version and judged timestamp only when the lease still belongs to the worker and the round remains eligible.
- Treat `UNCERTAIN` as non-final and retry within the bounded policy; do not silently convert uncertainty to incorrect.
- On exhausted provider/technical failures, void the Quick Battle match as a technical failure. Never count the failure as a player loss or a competitive zero-score outcome.

The shared adapter may be reused; the existing `AnswerJudgeWorker` must not claim or process Quick Battle answers.

## 5. Deadline and round finalization

A dedicated Quick Battle deadline/finalization path owns all timeout and round completion behavior.

- At deadline, lock the match and round and read the database clock.
- If there is no accepted answer, persist an explicit `NO_RESPONSE` outcome; do not infer it from a missing row.
- If an answer exists but is still being judged, do not finalize it as incorrect or as no-response.
- A round can complete early only after its accepted answer has a terminal successful judge decision.
- A timed-out unanswered round may complete with an explicit no-response record.
- Once completed, the next round can be published only after its question is generated and validated.
- The tenth completed round moves the match to `COMPLETED`. This is a lifecycle terminal state only; Stage 4 does not create competitive points, event rank, XP, or standard Ranking updates.
- Technical/provider failures that prevent a trustworthy outcome void the match, with a stable reason code and no competitive settlement.

All race-sensitive transitions must be idempotent and protected by database constraints/row locks. Use a consistent lock order: match, round, then answer/job.

## 6. Disconnect and reconnect

Disconnect does not pause, extend, or reset the official deadline. No client-side clock is authoritative.

Reconnect uses the existing authenticated principal and active-match recovery:
- Return the same match and current round.
- Return the public localized question only if it has been published.
- Return the original `startedAt` and `deadlineAt`, accepted-answer receipt/status, and match/round state.
- Never create a second match, a second answer, or a fresh deadline as a side effect of reconnect.
- If the deadline elapsed while disconnected, the deadline worker completes the appropriate no-response path.

A transient network disconnect alone is not a forfeit and does not alter competitive standing.

## 7. Required verification

Unit tests:
- Publication state machine and idempotency.
- No clock start before generated question readiness.
- Database-clock deadline calculation.
- Answer validation, exact idempotent replay, conflicting key reuse and second-answer rejection.
- Deadline equality boundary and client-clock independence.
- Judge input localization, invalid output, retry/uncertain behavior, exhausted failure and stale-lease fencing.
- Reconnect snapshot does not mutate state or reset the deadline.
- Early completion waits for judging; final round completes the match.

PostgreSQL integration tests:
- Concurrent publisher claims cannot publish twice or reset the clock.
- Concurrent answer submissions produce at most one accepted answer.
- Answer/deadline race has one deterministic database-serialized outcome.
- Stale judge worker cannot overwrite a newer lease or terminal match.
- Reconnect returns identical persisted deadline.
- Judge exhaustion and generation/deadline technical failures never create competitive results.
- The ten-round lifecycle completes without touching standard Match/1v1/1vAI tables.

CI must pass Prisma format/validation/generation, migration deployment against PostgreSQL, production build, unit tests, PostgreSQL integration tests, lint, staging Compose validation and Docker image build.

## 8. Explicitly deferred

The following are not Stage 4 decisions and must not be inferred:
- Quick Battle points formula, speed bonus, streak bonus, penalties, or competitive ranking.
- XP, standard global/season ranking, or 1v1/1vAI settlement.
- Event rewards, prizes, entry fees, payments, refunds, payouts, or financial ledger.
- Live production provider access before the Armenia account/payment dependency is resolved.

## 9. Delivery checkpoints

Implement and verify in small increments on `main`:
1. Public round projection and atomic round publication.
2. Immutable answer submission and idempotency.
3. Dedicated judge queue/worker and technical-failure policy.
4. Deadline/no-response and round/match finalization.
5. Reconnect recovery and PostgreSQL concurrency/regression coverage.

Do not mark Stage 4 complete until all checkpoints and the full CI workflow pass. After Stage 4, continue with Stage 5 only after the product owner approves the separate scoring design.
