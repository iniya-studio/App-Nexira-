# NEX-QB-002 — Quick Battle Architecture & Implementation Baseline

Status: Independent architecture locked; backend foundation and dedicated generation pipeline implemented on branch; runtime verification pending
Branch: `feature/quick-battle-foundation`
Base branch: `main`
Baseline commit: `98e9beec55bc4777009f905e19c0f8280ba33e40`

## 1. Purpose and non-negotiable boundary

Quick Battle is an independent, single-player-versus-system competitive game mode. It is not a configuration, subtype, or alternate entry point for the existing `ONE_V_AI` lifecycle.

Quick Battle MUST own its:
- aggregate and lifecycle state machine;
- match creation, active-match recovery, round progression, reconnect behavior and technical-void policy;
- question selection policy, generation queue, preparation/readiness and replacement policy;
- answer acceptance and result finalization;
- competitive score ledger and result records;
- event participation and event-ranking integration when that stage is approved.

A change to Quick Battle must not change the behavior, API contract, worker eligibility, scoring, settlement, or ranking of `ONE_V_AI` or `ONE_V_ONE`.

The architecture may reuse stable, provider-agnostic capabilities (AI generator adapter, question validation functions, AI Judge adapter, localization registry, database clock technique, identity principal contract, Prisma connection and generic infrastructure). Reuse means calling a narrowly defined port or pure utility. It does NOT mean routing Quick Battle through 1vAI services, workers, state transitions, scoring policies, settlement, or tables whose invariants are specific to 1vAI.

## 2. Locked product requirements

1. Quick Battle is a distinct mode and player-facing experience.
2. No category or subcategory selection is requested from the player.
3. Every match has exactly 10 questions.
4. Questions are dynamically generated for the match; fixtures or a static question bank are not a production source.
5. Each question is assigned from the 23 top-level categories in the current NEXIRA category catalog:
   `gaming`, `movies-tv`, `music`, `sports`, `technology`, `internet-social-media`, `anime-manga`, `superheroes-comics`, `geography`, `history`, `space`, `science`, `cars-motorsports`, `animals-nature`, `food-drinks`, `art-design`, `books-stories`, `culture-lifestyle`, `brands-business`, `mythology-legends`, `travel-tourism`, `education-mathematics`, `fashion-beauty`.
6. Category diversity is required: do not repeat the immediately preceding category; avoid any category repeat within a 10-question match while feasible. If policy constraints make a unique category impossible, use a deterministic documented fallback rather than blocking a match.
7. Difficulty is a balanced mix of easy, medium and hard. The exact distribution is an implementation policy to be versioned and tested; it must not be silently changed for an active match.
8. Question generation and answer judging are separate responsibilities:
   - AI Question Generator creates a structured question package.
   - Question Validator validates structure, supported category, language coverage, answer key, rubric, difficulty, time limit and duplicate/similarity fingerprint before publication.
   - AI Judge evaluates free-text answers independently of generation.
9. Questions must be clear, unambiguous, objectively gradable and presented in the player's selected language. Invalid or duplicate questions are rejected and replaced before they can become playable.
10. Prepare the first three validated questions before the match enters playable state. Generate and validate later questions in the background, maintaining a server-side ready queue. Provider latency must not consume a player's answer time.
11. Persist match state, question snapshots, accepted answers, deadlines and scores on the server. The database clock is authoritative.
12. A reconnect restores the same active match and current round. Disconnect does not pause or reset the server deadline. Previously accepted answers cannot be overwritten.
13. Technical/provider failures are not player losses. A technically invalid match must be voided or recovered under a defined server policy and must not enter competitive results.
14. Quick Battle has independent competitive events and ranking. Candidate event windows are 24 hours, 48 hours and weekends. Exact cadence, tie-breakers, eligibility and event rules remain product decisions.
15. Past event honors remain in the user's profile.
16. Entry fees, payment, prizes, refunds, payout and related ledger design are explicitly out of scope until product, legal and payment feasibility decisions are approved.
17. Payment must never grant competitive advantage. Free 1v1 and 1vAI remain intact and are not weakened to promote Quick Battle.

## 3. Repository audit at baseline

Repository: `iniya-studio/App-Nexira-`
Default branch: `main`
Quick Battle branch exists: `feature/quick-battle-foundation`
Branch head at audit: `98e9beec55bc4777009f905e19c0f8280ba33e40`
No Quick Battle backend implementation was present at this baseline.

Existing backend stack: NestJS, TypeScript, PostgreSQL, Prisma, REST, Socket.IO; modular monolith.

Relevant existing code inspected:
- `src/modules/match/match.service.ts`
- `src/modules/match/round.service.ts`
- `src/modules/match/answer.service.ts`
- `src/modules/match/question-generation.context.ts`
- `src/modules/match/question-generation.worker.ts`
- `src/modules/match/question-generator.port.ts`
- `src/modules/match/openai-responses-question-generator.adapter.ts`
- `src/modules/match/question-validation.ts`
- `src/modules/match/answer-judge.port.ts`
- `src/modules/match/openai-responses-answer-judge.adapter.ts`
- `src/modules/match/answer-judge.worker.ts`
- `src/modules/match/scoring.policy.ts`
- `src/modules/match/round-deadline.worker.ts`
- `src/modules/match/round-finalization.worker.ts`
- `src/modules/match/match-finalization.worker.ts`
- `src/modules/match/match-settlement.service.ts`
- `src/modules/match/category-catalog.ts`
- `prisma/schema.prisma`

### 3.1 Reusable capabilities

- `QuestionGenerator` port and its provider adapter are suitable for reuse after their input contract is checked against Quick Battle needs.
- Pure question validation and normalized fingerprint utilities are candidates for reuse; Quick Battle must add its own category/difficulty/selection-policy validation and duplicate scope.
- `FreeTextAnswerJudge` port and provider adapter are suitable for reuse through a dedicated Quick Battle judge worker.
- Locale normalization/registry and `AuthenticatedPrincipal` are shared infrastructure.
- Database `clock_timestamp()`, row locks, unique constraints, leases and idempotency patterns are proven implementation techniques.
- Existing category catalog contains 23 top-level categories and their subcategories.

### 3.2 Existing components that MUST NOT own Quick Battle execution

The existing match lifecycle is specifically 1v1/1vAI oriented:
- `MatchService.createAiMatch` creates `ONE_V_AI`, adds an AI participant, snapshots one category, and creates a `QuestionGenerationJob` for `Match`.
- `questionGenerationInputForMatch` requires a human participant plus participant locale snapshots, computes rematch exclusions, and creates context from an existing Match.
- `QuestionGenerationWorker` claims `QuestionGenerationJob` rows joined to `Match`, cancels jobs according to 1vAI `WAITING/READY` lifecycle rules, and applies readiness cancellation.
- `RoundService`, round deadline/finalization workers, and answer services operate on `Match`, `Round`, `Answer`, participant rows and existing lifecycle assumptions.
- `RoundFinalizationWorker` assumes exactly two active/disconnected participants.
- `MatchFinalizationWorker` assumes exactly two participants and uses `MatchSettlementService`.
- `MatchSettlementService` owns existing XP and standard 1v1 ranking rules; it is not a Quick Battle settlement service.
- Existing scoring policy is the current standard match scoring policy, not a confirmed Quick Battle product rule.

Do not register the existing match workers as Quick Battle workers, do not make them claim Quick Battle jobs, and do not route Quick Battle requests through `MatchService`, `RoundService`, `AnswerService`, or `MatchSettlementService`.

### 3.3 Current branch implementation (2026-11-26)

The baseline audit above records what existed before Quick Battle implementation. The following changes are now present on `feature/quick-battle-foundation`:

- This document was rewritten to remove 1vAI lifecycle ownership from Quick Battle.
- A dedicated Prisma aggregate was added: `QuickBattleMatch`, `QuickBattleRound`, `QuickBattleQuestionJob`, and `QuickBattleAnswer`.
- A dedicated migration adds database-enforced owner XOR, fixed ten-round matches, active-match partial unique indexes, round/job/answer uniqueness, and the required foreign keys.
- `QuickBattleModule`, `QuickBattleService`, `QuickBattleController`, and the creation DTO are registered independently in `AppModule`.
- Implemented endpoints: `POST /quick-battles`, `GET /quick-battles/active`, and `GET /quick-battles/:matchId`.
- Match creation snapshots the registered user's profile locale, or the guest-selected locale; creates exactly ten round plans and ten dedicated generation jobs; and serializes repeated start requests per principal.
- Ten distinct top-level categories are selected from the 23-category catalog. A subcategory is selected server-side within each category and persisted, because the existing provider adapter requires a specific subcategory for a valid generation request. The player does not choose either field.
- A versioned difficulty plan currently uses 3 EASY, 4 MEDIUM and 3 HARD questions. The initial generation request currently uses FREE_TEXT and a 30-second answer limit. These are provisional engineering defaults only; they are not final product decisions and must be approved before gameplay/competitive launch.
- `QuickBattleQuestionGenerationWorker` claims only dedicated Quick Battle jobs, reuses the generic question-generator port/adapter and pure validation/fingerprint utilities, persists accepted questions, retries invalid/provider-failed output, and marks a match READY only after the first three questions are valid.
- While a match is PREPARING, only its first three jobs are eligible. Once READY, the remaining question jobs can be generated in the background.
- Question duplicate rejection currently covers earlier questions in the same Quick Battle match. A per-principal recent-history exclusion is still pending.
- The existing Match/1vAI workers and `MatchSettlementService` are not registered as Quick Battle workers and do not own Quick Battle state transitions.

**Verification status:** no Prisma validation, migration application, Nest build, Jest test run or lint run has yet been executed against this branch. The code is committed to the feature branch, but must not be described as runtime-verified until those checks are run.

## 4. Architecture decision: separate aggregate and persistence

Quick Battle will have a dedicated NestJS `QuickBattleModule` and a dedicated persistence aggregate, separate from the existing `Match` aggregate.

Initial domain models to design:
- `QuickBattleMatch`: owner principal (user or guest), lifecycle status, language snapshot, rounds target (fixed at 10), current round, policy versions, timestamps, completion/void metadata and idempotency data.
- `QuickBattleRound`: match, round number, selected category, difficulty, question reference/snapshot, server start/deadline, completion/void metadata.
- `QuickBattleAnswer`: one immutable accepted answer per round, answer status, server accepted timestamp, elapsed milliseconds, judge status/decision/confidence/reason/version and awarded points.
- `QuickBattleQuestionJob`: dedicated generation queue item with immutable category/difficulty/language/policy request context, status, attempts, lease, retry schedule, error code and idempotency key.
- Optional dedicated score/result records only where they provide auditability beyond the match/round/answer snapshot. Avoid redundant mutable totals without a ledger/reconciliation strategy.

Questions may reference the generic `Question` content record only if referential integrity and immutable content semantics are preserved. Add a separate relation from `Question` to Quick Battle rounds; do not force Quick Battle through `Round` or `QuestionGenerationJob` relations tied to `Match`.

Identity ownership must support both USER and GUEST principals consistently with existing identity rules. Use database constraints to guarantee exactly one owner and uniqueness of active matches per principal; do not rely on an application-only check. The implementation must account for PostgreSQL partial unique indexes where Prisma cannot express the required active-state uniqueness directly.

Do NOT add `QUICK_BATTLE` to `MatchMode` merely as a label while storing the mode in a different aggregate. `MatchMode` describes rows in the existing `Match` aggregate. A dedicated `QuickBattleMatch` is the stronger isolation boundary and avoids accidental inclusion in 1v1/1vAI workers. Document this explicitly if the enum is revisited later.

## 5. Quick Battle lifecycle

Implement an explicit state machine owned by Quick Battle. Proposed minimum states:
- `PREPARING`: match and generation plan created; first three questions being generated/validated.
- `READY`: three valid questions are available and the player may enter the first round.
- `ACTIVE`: a round is live or the match is progressing.
- `COMPLETED`: all ten valid rounds finalized and the result is committed.
- `VOIDED`: the match is technically invalid and excluded from competitive results.
- `CANCELLED`: cancelled before becoming playable under explicit server policy.

Every transition must be checked server-side and transactionally. A repeated start request for one principal returns the existing eligible active/preparing match rather than creating another. Once a match is terminal, a new start may create a new match.

For each round:
1. Select and persist category and difficulty policy before requesting generation.
2. Claim one generation job using a lease and `FOR UPDATE SKIP LOCKED`.
3. Generate through the shared provider port.
4. Validate schema, category/difficulty match, locale, answer key/rubric, time limit and fingerprint.
5. Reject invalid/duplicate output and enqueue a bounded replacement attempt with a new idempotency key or attempt identity; never publish invalid content.
6. Persist the accepted question and mark the job complete atomically.
7. Publish the round only when its question is ready. Start deadline from the database clock at publication, not generation start.
8. Accept at most one answer per owner/round. Calculate elapsed time from database timestamps; never trust client score or time.
9. Judge free-text answers through a dedicated Quick Battle worker using the shared AI Judge port. Judge failure remains a technical pending/failure state, not an incorrect answer.
10. Finalize the round idempotently and advance the independent Quick Battle state machine.

The first three rounds must be generated and validated before the match is marked READY. Subsequent rounds are generated in the background; maintain a configurable queue target while guaranteeing that the next round is ready before it is shown. The queue target must not alter the fixed 10-round match length.

## 6. Category, difficulty and duplicate policy

- The category picker uses the 23 top-level category keys listed in section 2; no client category input is accepted.
- Select category server-side and persist it before generation so retries cannot silently switch categories.
- Avoid immediate repetition and prefer no repeated category within a match.
- Use a versioned deterministic policy so a match is reproducible and auditable.
- Difficulty mix must be balanced and fixed for the match at creation; the initial distribution is an engineering default pending product confirmation, not a monetization lever.
- Validate generated output against the requested category and difficulty. A provider returning a different category/difficulty is rejected.
- Duplicate detection uses normalized fingerprints and a defined lookback scope. At minimum it excludes every question already used in the same match and recently served to the same principal in Quick Battle. Cross-mode global exclusion may be added only if the data and cost are justified.
- Do not weaken validation to fill the queue. If bounded generation attempts fail, apply a technical failure policy and void/cancel the match without a player loss.

## 7. API contract direction

Dedicated authenticated REST routes; exact DTO and response shapes are to be finalized against current controller conventions:
- `POST /quick-battles`: create or return the principal's eligible active match. Accept only necessary client context such as selected locale if not already authoritative in profile; never accept category, score, deadline, winner or question payload.
- `GET /quick-battles/active`: recover the current eligible match for the authenticated USER/GUEST principal.
- `GET /quick-battles/:matchId`: participant-authorized state snapshot.
- `GET /quick-battles/:matchId/rounds/:roundNumber`: participant-authorized public question and round deadline; never expose answer key or grading rubric.
- `POST /quick-battles/:matchId/rounds/:roundNumber/answers`: submit one answer with an idempotency key.
- `GET /quick-battles/:matchId/result`: return final result only when terminal and valid.

Use the existing access-token guard/principal contract. Do not expose another user's match existence. DTO validation, ownership checks, rate limits, idempotency and response minimization are mandatory.

## 8. Scoring, results, events and money

- Quick Battle scoring must be a dedicated versioned policy. Do not call the standard 1vAI/1v1 scoring policy or standard XP/ranking settlement by default.
- The exact Quick Battle score formula is a product decision and remains open. Until approved, implement score-policy interfaces and persistence contracts without silently choosing a competitive formula.
- Match result creation and any future event-score posting must be idempotent and transactionally consistent.
- Quick Battle event ranking is independent of standard global/season ranking. Event windows, points formula, eligibility, tie-breakers, winners and honor retention require a separate design stage.
- Entry fees, prize pools, payments, refunds, payouts and financial ledger are out of scope for this foundation. Do not add speculative financial tables or endpoints.

## 9. Security, resilience and observability

- Server/database time is authoritative for deadlines and elapsed time.
- Persist accepted answers before acknowledging success.
- Unique constraints prevent duplicate answers and duplicate idempotency keys.
- Use row-level locks and atomic conditional updates for state transitions.
- Use worker leases, stale-lease recovery, bounded retries and dead-letter/terminal failure handling.
- Reconnect reads persisted state; it never resets a deadline.
- Do not reveal canonical answer, grading rubric, internal provider prompt, judge rationale or other players' private data before allowed result disclosure.
- Technical provider failure must not become a loss or a zero-score player penalty.
- Log structured identifiers and safe error codes; do not log credentials, raw secrets or unnecessary personal answer content.
- Test concurrency, duplicate requests, stale leases, worker crashes, invalid AI output, duplicate questions, timeout races, reconnect, guest identity conversion and cross-mode regression.

## 10. Implementation sequence

### Stage 1 — architecture and contract freeze
- Completed: this document defines the independent aggregate, lifecycle, API direction, worker boundaries and guardrails.
- Completed by code inspection: existing 1vAI workers are tied to Match/QuestionGenerationJob and cannot select QuickBattle tables.

### Stage 2 — independent backend foundation
- Implemented on the feature branch: dedicated Prisma models/migration, module, service, controller, DTOs and active-match recovery.
- Implemented database owner XOR and per-principal active-match partial unique indexes.
- Added focused service tests for ten-round creation, category diversity, difficulty plan, guest ownership, duplicate start recovery and registered-user locale authority.
- Pending: execute Prisma validation/migration, build, tests and lint; add integration tests for database concurrency and authorization.

### Stage 3 — independent question pipeline
- Implemented: versioned category/difficulty plan, server-selected subcategory, dedicated generation queue and worker.
- Implemented: reuse of the generator port/adapter and pure validation/fingerprint utilities only.
- Implemented: first-three readiness gate, background generation after READY, same-match duplicate rejection and bounded retries with technical void on exhaustion.
- Pending: runtime tests for retries, worker recovery, concurrent generation, localization, invalid output and question queue readiness; add per-principal recent-history duplicate exclusion.

### Stage 4 — gameplay and judging
- Add dedicated round publication, answer submission, deadline, reconnect and round finalization.
- Reuse AI Judge port/adapter through a dedicated Quick Battle judge worker.
- Add tests for authoritative clock, duplicate answer, deadline races, AI judge failure, disconnect/reconnect and technical void.

### Stage 5 — independent scoring and result
- Obtain product approval for scoring policy before implementing competitive points.
- Add dedicated result finalization and idempotency tests.
- Keep XP and standard Ranking untouched unless a separately approved integration is defined.

### Stage 6 — competitive events
- Define event model, windows, eligibility, ranking, ties and historical honors.
- Implement independently of standard RankingSeason.

### Stage 7 — payment and rewards
- Only after product, legal and payment-provider feasibility decisions.
- Design a proper immutable financial ledger, idempotent payment/refund/payout workflows and reconciliation.

### Stage 8 — security and beta hardening
- Abuse controls, anti-cheat signals, collusion review, observability, load/concurrency tests and failure drills.

### Stage 9 — client integration
- Replace local fixture preview with the dedicated Quick Battle API.
- Implement preparation state, match, reconnect, result, event and ranking screens.
- Verify 1v1/1vAI and Android regressions.

## 11. Delivery rules

- Work only on `feature/quick-battle-foundation`.
- Never push changes to `main` or merge a PR without the user's explicit approval.
- Inspect the actual branch files before editing; do not rely on conversation summaries.
- Every code change must include focused tests. Run the relevant tests, Prisma validation/generation, build and lint as appropriate; report only commands actually executed and their real outcomes.
- Do not claim a test passed unless it ran successfully.
- Keep commits focused and document architectural decisions.
- Do not implement event schedules, scoring formula, entry fees, prizes or payment behavior by inference.
