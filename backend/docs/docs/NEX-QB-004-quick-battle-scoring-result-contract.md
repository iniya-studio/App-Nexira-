# NEX-QB-004 — Quick Battle Scoring & Result Contract

Status: Implementation complete; CI status is tracked by the latest main workflow run
Target ref: `main`
Prerequisites: NEX-QB-002 baseline and NEX-QB-003 Stage 4 gameplay/judging complete and CI-verified
Approval: Product owner approval recorded 2026-11-27

## 1. Purpose and hard boundaries

This contract defines the first approved Quick Battle competitive scoring policy and the deterministic final result for one ten-round match.

Quick Battle owns its scoring and result lifecycle. Do not call or reuse the standard 1v1/1vAI scoring policy, MatchSettlementService, XP transactions, standard global ranking, or standard seasonal ranking. No changes to those systems or their behavior are permitted.

This stage does not implement competitive events, event leaderboards, event tie-breakers, prizes, entry fees, payments, refunds, payouts, or financial ledgers. Those remain separate product/design stages.

## 2. Approved scoring policy

Policy identifier: `quick-battle-score-v1`

Each round is scored independently from the persisted answer, terminal AI Judge decision, server-recorded elapsed time, and the question's immutable time limit.

### 2.1 Correct answer

A round receives points only when its accepted answer has a terminal `CORRECT` judge decision.

- Base points: 100.
- Maximum speed bonus: 50.
- Maximum round score: 150.

Let:
- `T` = the question's persisted `timeLimitSeconds × 1000`, in milliseconds.
- `E` = the server-persisted `elapsedMs` for the accepted answer.
- `R = max(0, T - E)` = remaining time in milliseconds.

The speed bonus is calculated using integer arithmetic and rounded down:

```text
speedBonus = floor(50 × R / T)
roundPoints = 100 + speedBonus
```

The implementation MUST avoid floating-point rounding differences. An integer-safe equivalent is `(50 * R) div T`, where `div` is integer division rounding down.

The elapsed time is measured by the database clock at answer acceptance relative to the persisted round start. Client-reported time, device clocks, network timestamps and client-calculated scores are never trusted.

The answer endpoint already rejects submissions at or after the persisted deadline. The scorer must nevertheless validate `T > 0` and `0 <= E < T`; invalid timing data is a technical integrity failure, not a player penalty.

Examples for a 30-second question:

| Server elapsed time | Base | Speed bonus | Round total |
|---:|---:|---:|---:|
| 0 ms | 100 | 50 | 150 |
| 15,000 ms | 100 | 25 | 125 |
| 29,000 ms | 100 | 1 | 101 |
| 29,999 ms | 100 | 0 | 100 |

### 2.2 Incorrect and unanswered

- A terminal `INCORRECT` judge decision receives 0 points.
- An explicit `NO_RESPONSE` round outcome receives 0 points.
- No negative points or penalties are applied.
- A missing answer row alone must not be interpreted as `NO_RESPONSE`; Stage 4's explicit timeout outcome is the source of truth.

### 2.3 Non-final and technical judge outcomes

- `PENDING`, `PROCESSING`, and `UNCERTAIN` are not scoreable outcomes. Do not award provisional points or finalize a match while any round lacks a terminal valid outcome.
- A judge/provider failure that exhausts the dedicated retry policy must follow Stage 4's technical-void behavior. A technically voided match receives no competitive result and must not be represented as a player loss or a zero-point competitive result.
- A malformed or inconsistent persisted answer/judge/timing state is an integrity failure. Do not guess a score; use the established technical-void/error policy and emit a stable reason code.

## 3. Match total and result

- A valid Quick Battle match contains exactly 10 completed rounds.
- Match total is the sum of the ten persisted round point values.
- Minimum valid total: 0.
- Maximum valid total: 1,500.
- The result records the scoring policy version used to calculate it.
- The result is available only after all ten rounds have terminal, valid outcomes and the match is completed.
- No result is created for `VOIDED` or `CANCELLED` matches.
- Recalculation/replay must produce the same score from the immutable persisted inputs and the recorded policy version.

The result contract should persist an auditable per-round score snapshot and one immutable match result. Prefer using the existing QuickBattleAnswer.points field for the per-answer awarded points, with a dedicated result record for the match total and summary counts. Do not add a mutable aggregate total without a deterministic reconciliation strategy.

Suggested result summary fields:
- match identifier (unique);
- scoring policy version;
- total points;
- correct-answer count;
- incorrect-answer count;
- no-response count;
- finalization timestamp.

The exact Prisma shape may follow repository conventions, but uniqueness and immutability requirements in this contract are mandatory.

## 4. Finalization, transactionality and idempotency

- Finalization is owned by a dedicated Quick Battle result/scoring service or worker.
- Lock in the established order: match, round, answer/result.
- Finalize only a `COMPLETED` match with exactly ten completed, non-voided rounds.
- Verify each round has exactly one explicit terminal outcome: a valid terminal judged answer or an explicit no-response outcome.
- Calculate each round's score from persisted data and this policy version; never accept score input from a client.
- Persist all round points and the match result atomically in one database transaction.
- Enforce one result per match with a database unique constraint.
- Repeated worker execution, retries, duplicate completion notifications and concurrent finalizers must return or preserve the same committed result; they must not double-award points or mutate a finalized result.
- If a result already exists, verify its policy version and immutable totals; do not silently overwrite it.
- A technical void racing with finalization must serialize deterministically. A voided match cannot receive a result.

## 5. Ranking and progression boundary

This contract does not post Quick Battle points to XP, standard global ranking, standard seasonal ranking, or existing 1v1/1vAI settlement.

Quick Battle competitive event ranking is a separate Stage 6 design and implementation. It may consume the immutable match result later, but event eligibility, event windows, event score aggregation, tie-breakers, winner selection and historical honors are not decided here.

## 6. Required tests

Unit tests:
- Correct answer at zero elapsed time: 150 points.
- Correct answer at half the time limit: 125 points.
- Correct answer near deadline: integer-floor behavior.
- Incorrect answer: 0 points.
- Explicit no-response: 0 points.
- Pending/processing/uncertain judge state is not scoreable.
- Invalid time limit or elapsed time is an integrity failure, not a player penalty.
- Ten-round total bounds and summary counts.
- Policy version is persisted and used deterministically.

PostgreSQL integration tests:
- Atomic persistence of all ten round points and one match result.
- Duplicate finalization returns the original result without double-awarding.
- Concurrent finalizers create exactly one result.
- Partial/incomplete rounds cannot finalize.
- Judge exhaustion/technical void never creates a result.
- Void/finalization race cannot produce a result for a voided match.
- Reconciliation recomputes the same total from persisted round points.
- No writes occur to XP, standard ranking, or Match settlement tables.

CI must pass Prisma formatting/validation/generation, migration deployment against PostgreSQL, production build, focused unit tests, PostgreSQL integration tests, lint, staging Compose validation and Docker image build.

## 7. Implementation sequence

1. Add this approved contract to the repository.
2. Inspect and extend the dedicated Quick Battle Prisma schema with immutable result persistence and required constraints.
3. Implement deterministic scoring and dedicated idempotent result finalization.
4. Add focused unit and PostgreSQL concurrency/integrity tests.
5. Verify that standard 1v1/1vAI scoring, XP, ranking and settlement remain untouched.
6. Run the full backend CI workflow and record the verified commit and run.

## 8. Delivery rules

- Work directly on `main`; no branch is authorized or required for this stage.
- Never create a branch without Milad's explicit prior approval.
- Do not force-push, rewrite history, or change repository settings.
- Preserve all Stage 4 behavior and its tests.
- Do not implement Stage 6 events/ranking, XP, prizes, fees, payment or payout behavior in this stage.
- Report only tests and CI checks that actually ran and passed.
