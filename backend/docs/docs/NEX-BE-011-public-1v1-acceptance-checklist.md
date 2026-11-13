# NEX-BE-011 — Public 1v1 Acceptance Checklist

**Status:** Acceptance plan — execution pending  
**Branch policy:** All implementation and documentation changes are made directly on `main`. Do not create a new branch for this work.  
**Release rule:** Keep both public 1v1 feature flags disabled until every required acceptance test passes.

## 1. Feature gates and environment

Before controlled acceptance testing:

- Backend: set `NEXIRA_PUBLIC_1V1_ENABLED=true`.
- Frontend build: set `VITE_ENABLE_PUBLIC_1V1=true`.
- Use a deployed HTTPS API and the intended PostgreSQL 16 database.
- Keep production rollout disabled for general users until the acceptance report is approved.
- Use two separate Android devices and two distinct principals. Never share access or refresh tokens between devices.

## 2. Required two-device test matrix

| ID | Scenario | Expected result | Evidence |
|---|---|---|---|
| 1 | Guest A and registered B enqueue the same category and language | Exactly one 1v1 match is created; both queue entries become MATCHED | Queue IDs, match ID, participant IDs |
| 2 | Same category but different languages | No pairing across languages | Both queue entries remain WAITING |
| 3 | Same language but different categories | No pairing across categories | Both queue entries remain WAITING |
| 4 | One principal attempts to enqueue from two sessions/devices | Only one WAITING entry; second enqueue is rejected safely | Principal ID, both session IDs, one queue row |
| 5 | Three or more compatible players enqueue | FIFO pairing; no queue entry is consumed twice | Queue timestamps and resulting match IDs |
| 6 | Player cancels while another enqueue attempts pairing | Exactly one valid outcome: cancellation wins or pairing wins; never a half-match | Queue states and match rows |
| 7 | Both clients enter the matched game | Same match, same round, same canonical question and time limit | Match ID, round ID, question ID, deadline |
| 8 | Both players submit at nearly the same time | Each accepted answer is stored once; server remains final authority | Answer IDs, idempotency keys, timestamps |
| 9 | One player submits at the deadline boundary | Exactly one valid server outcome; no duplicate scoring or double finalization | Answer status, round status, result |
| 10 | Network drops and reconnects | Client restores the same active match and current scores | Match snapshot before/after reconnect |
| 11 | App is force-stopped and reopened during a round | Queue recovery opens the same match and restores round/question state | Match ID, round ID, participant scores |
| 12 | Guest converts to a registered account during an active match | Queue and active participant ownership transfer; match continues; no duplicate XP | Old guest ID, new user ID, match participant row |
| 13 | Match completes normally | Correct winner/draw, XP ledger and eligible ranking transactions are committed exactly once | MatchResult, XPTransaction, RankingTransaction |
| 14 | Match ends by forfeit/deadline | Correct terminal result and exactly-once settlement | MatchResult and progression ledgers |
| 15 | Android system Back is pressed while searching | Queue cancellation is requested; app returns to mode selection | Queue status CANCELLED or MATCHED |
| 16 | A completed match is followed by a new 1v1 search | New idempotency key and new queue entry; previous result is not replayed as an active queue | Old/new queue IDs and idempotency keys |

## 3. Regression checks

- Run the existing 1vAI lifecycle tests before and after public 1v1 acceptance.
- Confirm AI Question Generator and AI Judge behavior is unchanged.
- Confirm shared Match Engine scoring, deadlines, and finalization behavior are unchanged.
- Confirm 1v1 and 1vAI XP settlement is idempotent.
- Confirm guests earn XP/levels but do not enter registered-user ranking tables.
- Confirm registered users update Global Ranking and the active Seasonal Ranking independently from XP.

## 4. Automated quality gates

All must pass on the current `main` commit:

1. Prisma format, validate, and client generation.
2. Additive migration deployment against PostgreSQL 16.
3. NestJS production build.
4. Full Backend unit and PostgreSQL integration suite.
5. ESLint.
6. Frontend tests.
7. Web/Android build.
8. APK verification and artifact upload.

## 5. Required evidence and pass criteria

Record the tested app version, main commit SHA, API deployment version, device/OS versions, test date, match IDs, round/question IDs, and relevant database ledger IDs. Never include credentials, access tokens, refresh tokens, or personal account secrets in the report.

A test passes only when the expected database state and both clients agree. A green build alone is not acceptance.

**Release approval requires:** all automated gates green, all required two-device scenarios passed, no unresolved critical/high-severity issue, and successful verification that 1vAI remains unchanged. Until then, keep `NEXIRA_PUBLIC_1V1_ENABLED` and `VITE_ENABLE_PUBLIC_1V1` off for general production users.
