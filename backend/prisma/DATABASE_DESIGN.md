# NEXIRA Database Design Rules

**Document ID:** NEX-BE-DB-001  
**Version:** 1.0  
**Status:** Database stabilization baseline

## 1. Authority and consistency
- PostgreSQL is the persistent source of truth.
- The backend owns match state, deadlines, accepted answers, adjudication, scoring, XP, and ranking.
- Client-provided scores, winners, elapsed times, and state transitions are never trusted without server validation.
- Any operation that changes a match result and its derived ledgers must run in a database transaction.

## 2. Match and answer integrity
- A Round belongs to exactly one Match.
- A MatchParticipant belongs to exactly one Match.
- An Answer must reference a Round and a MatchParticipant from the same Match. Composite foreign keys in the Prisma schema enforce this at database level.
- At most one accepted Answer exists per participant per Round.
- Answer submissions may carry an idempotency key. Repeated requests with the same key must return the original outcome and must not award points twice.
- responseText stores submitted text for audit and adjudication. It must never be exposed through another participant's public match-state response.
- judgeStatus separates adjudication workflow from the decision itself. A timeout or provider failure remains PENDING/FAILED and must not be converted into INCORRECT.
- decision is populated only when a judge decision exists. UNCERTAIN is a completed adjudication outcome, not a transport failure.
- The backend validates that a MatchResult winner is a participant of that same Match before persisting it. This remains a transactional domain invariant.
- A technical-void replacement is recorded in a unique, durable QuestionGenerationJob in the same transaction as the void. PostgreSQL row locks and leases coordinate workers; provider requests must remain outside database transactions.
- A replacement Round has no active clock until each required MatchParticipant has a RoundReadiness record marked ready. Question answer keys remain private while the replacement is waiting.

## 3. Room membership lifecycle
- (roomId, userId) identifies one durable membership record.
- Leaving a room changes the existing membership to LEFT and sets leftAt; it does not create a second membership row.
- Rejoining reactivates that same row, clears leftAt, and restores the authorized role/status according to room policy.
- Removed or banned members cannot reactivate themselves. Only an authorized room owner/host action may change those states.

## 4. Progression and ranking
- XP and competitive Ranking Points are independent ledgers and must never be conflated.
- UserProgress and GuestProgress store currentLevelXp within the current level, lifetime totalXp, and the current derived level snapshot. Guest progression is retained in GuestXPTransaction and GuestProgress until account conversion.
- XP transactions are idempotent and applied atomically with the matching progress snapshot. Guest-to-user conversion transfers the guest snapshot and ledger history into UserProgress/XPTransaction in the same serializable transaction; historical MatchParticipant guest references remain immutable.
- V1 XP: +2 per judged correct answer, +1 per judged incorrect answer, +10 for completing a match, +5 for a win, +3 for a draw. A forfeiting participant receives only earned answer XP. Voided/unanswered rounds and AI participants earn no XP.
- Level curve: the XP needed to advance from level L to L+1 is 100 × L; total XP is cumulative and never resets.
- Global ranking is all-time and is stored in GlobalUserRanking. Eligible registered-user 1v1 outcomes award win +20, draw +10, loss +0.
- Seasonal ranking is stored in UserRanking, scoped by RankingSeason; the season covering the authoritative match completion timestamp receives a parallel ranking event.
- RankingTransaction.scope is GLOBAL when seasonId is null, and SEASON when seasonId is non-null. The service must enforce this pairing. A database CHECK constraint should be added in the first reviewed SQL migration.
- Only eligible, completed matches affect ranking. Guest participants are excluded from ranking.
- Store purchases never award XP or Ranking Points and must not create competitive advantage.

## 5. Security and privacy
- Refresh tokens are stored only as hashes; each hash is unique.
- Question answer keys and grading rubrics are server-only fields. They must not be serialized into public question DTOs or match events.
- Public match-state payloads expose only information needed by that viewer and must not reveal another participant's submitted answer before the round's reveal point.
- Secrets, raw refresh tokens, and sensitive authentication material must never appear in logs.

## 6. Constraints and transaction requirements
- Match completion, MatchResult creation, XP ledger insertion, ranking ledger insertion, and aggregate updates must be atomic where applicable.
- Unique idempotency keys are required for XP and ranking ledger writes.
- Duplicate answer submission is rejected or replayed idempotently; it never creates a second accepted answer.
- Room membership reactivation updates the existing unique row.
- Service-layer validation must check ownership and authorization even when foreign keys are valid.
- Ready requests may update only the caller's own readiness row. The server/database owns readiness timestamps, shared round start/deadline, currentRound, and score transitions.

## 7. Deliberately deferred
- Store catalog and Purchase persistence will be added with the Store domain implementation, before the first production schema release. The v1 Store UI can exist before real payment processing is enabled.
- Payment-provider callbacks, refunds, and external transaction reconciliation are not part of the initial database foundation.
- Room invitations, room chat messages, and room leaderboards remain v2 features.
- No Redis, message broker, or microservice-specific persistence is introduced for v1.

## 8. Migration policy
- Do not create or apply a migration against a production database during schema stabilization.
- The first migration must be generated against a disposable development database, reviewed as SQL, and tested from an empty database.
- Add database CHECK constraints that Prisma schema cannot express directly, including ranking scope pairing and numeric/time bounds, in reviewed migration SQL.
- CI schema validation and client generation are necessary but do not replace PostgreSQL integration tests.
