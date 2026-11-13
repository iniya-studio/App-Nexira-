# NEX-BE-010 — Match Progression & Ranking Settlement Contract

**Project:** NEXIRA  
**Version:** 1.0  
**Status:** Approved engineering baseline for V1 implementation  
**Target branch:** `main` only  
**Depends on:** NEX-BE-006 Synchronized Match Core; NEX-BE-008 AI Judge & Server-Side Scoring; NEX-BE-009 Public 1v1 Matchmaking; existing Identity/Guest Identity contracts  
**Scope:** Exactly-once XP progression and competitive ranking settlement after authoritative match completion.

## 1. Objective

Connect completed matches to the existing XP and Ranking persistence foundations without merging the three independent concepts:

1. **Match score** decides the outcome inside one match.
2. **XP** advances a player's level and is not a competitive rating.
3. **Ranking Points** determine competitive leaderboard placement and are not XP.

Reuse `UserProgress`, `XPTransaction`, `GlobalUserRanking`, `UserRanking`, and `RankingTransaction`. Do not redesign Match Core, change answer/round scoring, or introduce a separate rating/ELO engine.

## 2. Non-negotiable invariants

- The server derives all rewards from persisted match, participant, round, answer, and result records. Never accept reward amounts, winner, score, or ranking changes from a client.
- A match is eligible only after its authoritative `MatchResult` and terminal `COMPLETED` state are committed.
- Match result creation, XP ledger entries, ranking ledger entries, and their aggregate snapshots are committed in the same database transaction.
- Unique idempotency keys make retries and concurrent settlement safe. A retry must not award twice.
- Voided/technically replaced rounds do not earn XP; their reversed score entries do not affect XP or ranking.
- A cancelled, abandoned, failed, or result-less match earns no XP or Ranking Points.
- Store purchases, cosmetics, and payment status never affect XP or competitive ranking.
- Ranking is only for eligible human-versus-human `ONE_VS_ONE` matches. `ONE_VS_AI` may award XP but never competitive ranking.
- Unconverted guests may play and progress. They are excluded from competitive ranking until they have a registered account.

## 3. V1 XP policy

XP is a progression reward, deliberately independent of the match's score scale and speed bonus.

### 3.1 Per-participant reward

For each human participant, compute from final persisted records:

| Condition | XP |
|---|---:|
| Each judged correct answer in a non-voided round | +2 |
| Each judged incorrect answer in a non-voided round | +1 |
| No response / unanswered / unresolved / voided-round answer | 0 |
| Match completion bonus, only if participant status is `COMPLETED` | +10 |
| Win bonus, only for the authoritative winner of a completed match | +5 |
| Draw bonus, only when the completed match has no winner | +3 |
| Forfeited participant | Keeps earned answer XP only; no completion or outcome bonus |

- Maximum normal ten-round XP: 35 (10 completion + 20 for ten correct answers + 5 win).
- No speed bonus is converted to XP. Speed already contributes to match score.
- A player is never given XP merely for entering a queue or creating a match.
- The same policy applies to human participants in 1v1 and 1vAI. AI participants never receive XP.

### 3.2 Level curve

Use one deterministic, server-owned curve for registered and guest progression:

- XP required to advance from level **L** to **L+1**: `100 × L`.
- Cumulative XP required to reach level **L**: `50 × L × (L - 1)`.
- `totalXp` is lifetime XP and never resets.
- `level` and `currentLevelXp` are derived from `totalXp`; they are updated atomically with each ledger insertion.
- No client-side level calculation is authoritative.

Examples: level 1 starts at 0 XP; level 2 at 100; level 3 at 300; level 4 at 600.

### 3.3 Guest progression and conversion

Guest play must not silently discard earned progression.

- Add additive `GuestProgress` and `GuestXPTransaction` persistence linked to `GuestIdentity`. These mirror the level snapshot and immutable/idempotent ledger semantics of registered-user XP.
- An unconverted guest receives XP in the guest ledger and can see the same level progression.
- During guest-to-user conversion, transfer the guest's lifetime XP and level snapshot into the newly created `UserProgress` in the same serializable identity-conversion transaction. Create corresponding immutable `XPTransaction` transfer records with deterministic conversion idempotency keys. Retain guest ledger history for audit; do not award it again.
- After conversion, a match participant still referencing the guest identity resolves to `GuestIdentity.convertedToUserId` and receives future rewards in the registered user's ledger, never both ledgers.
- Match settlement and guest conversion must serialize on the guest identity row. If settlement wins first, conversion transfers the committed guest XP; if conversion wins first, settlement credits the user. There must be no lost or duplicated reward.
- If a match finishes after conversion, the converted account receives the reward even if the historical participant row still references the guest identity.

## 4. V1 competitive Ranking policy

Ranking measures 1v1 competitive outcomes, not XP, answer speed, purchases, or time spent.

### 4.1 Points per eligible 1v1 result

| Outcome | Ranking Points change |
|---|---:|
| Win | +20 |
| Draw | +10 |
| Loss | +0 |

- A forfeit is treated according to the authoritative `MatchResult`: the remaining winner receives +20 and the forfeiting participant receives +0.
- Wins/losses/draws/matchesPlayed counters are updated for both registered human participants, including a loss with zero points.
- Guest participants without a converted registered account do not enter ranking aggregates or ranking ledgers.
- No ELO, opponent-strength multiplier, streak multiplier, paid boost, or client-supplied adjustment in V1.
- Ranking points are never reset when a season ends.

### 4.2 Global and seasonal ledgers

- Every eligible registered-user 1v1 result updates `GlobalUserRanking` and creates one `GLOBAL` `RankingTransaction`.
- If exactly one `ACTIVE` `RankingSeason` covers the match's authoritative `completedAt` (`startsAt <= completedAt < endsAt`), also update that user's `UserRanking` and create one `SEASON` transaction.
- If no season covers the completion time, global ranking still updates; no seasonal row is created.
- More than one matching active season is an invariant violation. Do not select an arbitrary season or silently double-count; fail the settlement transaction and surface an operational error until season configuration is corrected.
- Enforce `GLOBAL => seasonId IS NULL` and `SEASON => seasonId IS NOT NULL` in service logic and a PostgreSQL CHECK constraint, after verifying whether the existing initial migration already contains the constraint. Do not rewrite the approved initial migration.

## 5. Idempotency and transaction design

### 5.1 Canonical keys

- Registered XP: `match:{matchId}:user:{userId}:xp:v1`
- Guest XP: `match:{matchId}:guest:{guestIdentityId}:xp:v1`
- Global ranking: `match:{matchId}:user:{userId}:ranking:GLOBAL:v1`
- Seasonal ranking: `match:{matchId}:user:{userId}:ranking:SEASON:{seasonId}:v1`
- Guest conversion transfer: `guest-conversion:{guestIdentityId}:xp:{guestXPTransactionId}:v1`

Ledger rows are immutable. Corrections require a compensating ledger event, never mutation or deletion of the original event.

### 5.2 Transaction boundary

Introduce a focused `MatchSettlementService` that accepts the existing Prisma transaction client; it must not open a nested transaction.

Call it from every authoritative path that creates a terminal `MatchResult`:
- normal final-round completion in `MatchFinalizationWorker`;
- early terminal forfeit completion in `RoundDeadlineWorker`.

Within the same transaction:
1. Lock/read the terminal match, result, participants, and eligible answer history.
2. Resolve each human participant to a registered user or an unconverted guest identity.
3. Compute XP from non-voided persisted answers and final participant/result status.
4. Insert the appropriate XP ledger row and atomically update the matching progress snapshot.
5. For eligible 1v1 registered users, insert global and (if applicable) seasonal ranking transactions and update aggregates.
6. Commit result and all settlements together.

If an idempotency key already exists, verify that its match, principal, amount, scope, and reason match the expected deterministic settlement. A conflicting existing row is an integrity error, not a successful duplicate.

### 5.3 Concurrency

- Serialize updates to each progress/ranking aggregate using row locks or a serializable transaction with bounded retry for serialization conflicts.
- Guest settlement and guest conversion must lock the same `GuestIdentity` row before resolving the destination ledger.
- Use database uniqueness as the final exactly-once guard; process-local locks are not sufficient.
- Keep AI/provider/network calls outside settlement transactions.
- Settlement is a database-only operation and must remain safe after process restart.

## 6. Implementation boundaries

- Preserve Match Core's existing answer points, no-response penalties, forfeit transfer, round timing, and result rules.
- Do not put XP or Ranking logic in the frontend, question generator, AI Judge, or matchmaking queue.
- Do not create a second MatchResult or a separate completion worker that races the existing workers.
- Do not award ranking for 1vAI, rooms, unfinished matches, or guest-only identities.
- No Redis, broker, microservice, or new external provider is required.
- Prefer the existing NestJS modular monolith and PostgreSQL transaction model.
- Add only the guest progression schema/migration required to preserve guest progression; do not alter unrelated models.

## 7. Required tests

Unit tests:
- XP formula for correct, incorrect, unanswered, voided, completed, draw, win, and forfeited outcomes.
- level derivation at every boundary (99/100, 299/300, 599/600 XP).
- ranking outcome mapping (win/draw/loss/forfeit).
- global-only settlement when no season is active; seasonal settlement for one active season; fail-safe behavior for overlapping active seasons.
- registered, unconverted guest, and converted guest destination resolution.

PostgreSQL 16 integration tests:
- normal 1v1 result settles XP and global/season ranking atomically for both users.
- 1vAI settles human XP but creates no ranking events.
- guest receives guest XP and no ranking; conversion transfers all prior XP exactly once.
- guest conversion racing match settlement cannot lose or duplicate XP.
- retrying either finalization worker does not duplicate ledger rows or aggregate increments.
- simultaneous completed matches for one user do not lose progress/ranking increments.
- a transaction failure rolls back MatchResult, ledger rows, and aggregate updates together.
- technical void/replacement rounds are excluded from XP.
- forfeits produce the approved XP/ranking result without changing match-score settlement.

Quality gates:
- Prisma format/validate/generate.
- Additive migration deployed against PostgreSQL 16.
- Nest production build, full Backend unit/integration suite, ESLint.
- Existing 1vAI tests remain green and unchanged in behavior.
- No changes to `main` are considered complete until all gates pass.

## 8. Release acceptance

The settlement layer is accepted only when a full real 1v1 match can be completed on two clients and the server produces exactly one MatchResult, one XP event per eligible participant, one global ranking event per registered participant, and one seasonal event per participant only when a season is active. Reconnect, worker restart, repeated finalization, and guest conversion must not change the final ledger totals.

Automated CI alone does not constitute two-device or production acceptance.
