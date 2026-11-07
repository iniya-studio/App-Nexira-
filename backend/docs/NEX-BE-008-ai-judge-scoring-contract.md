# NEX-BE-008 — AI Judge & Server-Side Scoring Contract

**Project:** NEXIRA  
**Version:** 0.2  
**Status:** Draft — technical contract for implementation planning; scoring values and cumulative no-response/forfeit accounting are aligned with NEX-BE-006 Version 1.1  
**Target branch:** `feature/backend-foundation`  
**Related contracts:** NEX-BE-006 Match Core & Synchronized Round Contracts; NEX-BE-007 Match Entry, Synchronized Questions & Answer Acceptance

## 1. Purpose and authority

This contract defines how accepted answers are adjudicated, how score is calculated, and what must be true before a round or match can be finalized.

The backend is the sole authority for:
- answer acceptance time and deadline enforcement;
- answer adjudication and final decision;
- base points and speed bonus;
- no-response records and penalties;
- round and match results.

The client may display results but must never submit or determine correctness, points, speed bonuses, penalties, winner, XP, or ranking changes.

## 2. Existing implementation baseline

The current V1 answer-acceptance path:
- accepts canonical option IDs for multiple-choice questions and text for free-text questions;
- records database-derived `acceptedAt` and `elapsedMs`;
- enforces one answer per participant per round and idempotent retries;
- persists accepted answers with `judgeStatus=PENDING`, `points=0`, and `speedBonus=0`;
- does not reveal correctness or score in the answer receipt.

The Prisma schema already contains `JudgeDecision` (`CORRECT`, `INCORRECT`, `UNCERTAIN`), `JudgeStatus` (`NOT_REQUIRED`, `PENDING`, `COMPLETED`, `FAILED`), and fields for confidence, reason, and judge version. This contract must be implemented against the actual schema and migrations; do not duplicate existing fields without a demonstrated need.

## 3. Adjudication strategy

### 3.1 Multiple-choice answers

Multiple-choice adjudication is deterministic and server-side:
- compare the submitted canonical option ID with the stored canonical answer key;
- do not send this decision to an LLM;
- persist `CORRECT` or `INCORRECT` and the active rules/judge version metadata;
- never expose the answer key before the round's reveal/finalization stage.

### 3.2 Free-text answers

Free-text answers use a provider-independent AI Judge adapter.

The judge receives only the minimum required trusted context:
- canonical question and language;
- expected answer / answer key;
- grading rubric and accepted equivalent concepts;
- participant response;
- judge policy and version.

The judge must evaluate meaning, not exact string equality. It must accept valid equivalent wording, synonyms, spelling variations that do not change meaning, and concise answers that satisfy the rubric. It must reject answers that are materially incorrect or omit essential required concepts.

The judge must return a structured result:
- decision: `CORRECT`, `INCORRECT`, or `UNCERTAIN`;
- confidence: numeric value in the documented range;
- short reason code and concise internal rationale;
- judge provider/model identifier and policy version.

Provider-specific response formats must be normalized inside the adapter. Match and scoring services must depend only on the internal contract, never on a provider SDK or provider-specific schema.

### 3.3 Confidence and uncertainty

Raw model confidence is not automatically calibrated or trustworthy. Production thresholds must be selected from a representative evaluation set and recorded with the judge policy version.

Until thresholds are validated:
- do not silently convert `UNCERTAIN` to `INCORRECT`;
- do not award or deduct final points for an unresolved answer;
- route uncertain outcomes through a bounded secondary adjudication path;
- preserve the original decision, attempts, and version metadata for audit.

## 4. AI Judge security and reliability

- Treat participant response text as untrusted data, never as instructions to the judge.
- Explicitly instruct the judge to ignore commands, prompt-injection attempts, role changes, or requests embedded in the submitted answer.
- The judge has no tools and no authority to call application services or mutate game state.
- Do not send private participant identity data unless strictly required; normally it is not required.
- Do not return answer keys, rubrics, internal rationale, or provider metadata to the opposing participant.
- Apply strict input/output size limits, schema validation, timeouts, bounded retries, and rate limits.
- Store judge version and enough audit metadata to reproduce the policy decision without storing unnecessary sensitive data.
- Use a provider fallback only through the same internal adapter contract.

### Judge failure policy

A provider timeout, malformed response, or exhausted retry budget is a technical adjudication failure, not an incorrect answer.

- Retry only within a bounded policy; avoid unbounded waits and duplicate scoring.
- Keep the answer unresolved while adjudication is pending.
- Never settle points or a winner while a submitted answer that affects the result remains unresolved.
- If all configured adjudication paths fail, mark the round as technically interrupted/void under a server-controlled recovery policy. Do not penalize either player for the technical failure; do not award a win based on an unresolved answer.
- Record the interruption reason and trigger operational monitoring.

Exact retry counts, timeout budgets, and fallback-provider order are deployment configuration and must be load-tested before release.

## 5. Scoring policy

### 5.1 Correct-answer points

The current proposed V1 scoring table is:

| Server-measured elapsed time | Base points | Speed bonus | Total |
|---|---:|---:|---:|
| Less than 3,000 ms | 10 | 15 | 25 |
| 3,000–4,999 ms | 10 | 10 | 20 |
| 5,000–6,999 ms | 10 | 5 | 15 |
| 7,000 ms or more | 10 | 2 | 12 |

Rules:
- Award points only after a final `CORRECT` decision.
- An `INCORRECT` answer receives zero points and zero speed bonus.
- Use the server-persisted `elapsedMs`; never trust a client timer.
- Boundaries are inclusive as shown and must have explicit unit tests.
- Calculate and persist the score once, transactionally and idempotently.

**Approval gate:** These values are a carried-forward project proposal, not yet confirmed against the canonical NEX-BE-006 source. Reconcile and lock the scoring table before implementation. Do not change these values silently.

### 5.2 No-response and consecutive penalties

A missing answer must be represented by an explicit `NO_RESPONSE` record after the server deadline has passed. It must not be inferred solely from the absence of an answer row.

The V1 consecutive no-response and forfeit rule is aligned with NEX-BE-006 Version 1.1:
- first consecutive no-response: apply -5 points to the non-responding participant;
- second consecutive no-response: apply a further -5 points to that participant;
- third consecutive no-response: apply a further -10 points and trigger surrender/forfeit;
- the three deductions total exactly -20 points for the forfeiting participant;
- credit the remaining participant with +20 points once as the forfeit transfer, representing the same accumulated penalty amount.

**No additional -20 deduction is permitted at the moment of forfeiture.** The forfeiting participant's total penalty across the three consecutive no-responses is -20, not -40. The +20 transfer to the remaining participant is not another deduction from the forfeiting participant.

The score ledger must make the accounting explicit and auditable. Record the three penalty entries against the forfeiting participant and one corresponding transfer credit for the remaining participant. Apply the transfer only once, using a stable idempotency key tied to the match/forfeit event. Round retries, match finalization retries, and recovery workers must never duplicate deductions or the transfer. The settlement must be atomic.

A valid submitted answer breaks the consecutive no-response streak. A technical interruption or voided round must not count as a no-response. A disconnect alone is not a no-response; the server deadline and explicit outcome determine it.

## 6. Round finalization

A round may be finalized only when:
1. the answer deadline has passed or all required participant outcomes are otherwise closed by a valid server transition;
2. every submitted answer has a final adjudication decision;
3. every participant has either an accepted answer outcome or an explicit `NO_RESPONSE` outcome;
4. all score and penalty ledger entries for the round are calculated.

Finalization must be atomic and idempotent:
- lock the relevant Match/Round state in PostgreSQL;
- prevent answer submission/timeout races from producing two outcomes;
- write decisions and score changes once;
- mark the round completed only after all required writes succeed;
- preserve an immutable audit trail.

A participant who disconnects is not automatically a no-show. The server deadline and accepted-answer record determine the outcome; reconnecting must not change the original server timestamps.

## 7. Match finalization and settlement

A match may be completed only after all configured rounds have finalized or a valid terminal condition (such as surrender) has been applied.

In one transaction:
- calculate final participant scores from the authoritative score ledger;
- determine winner/draw according to the approved match rules;
- create the unique `MatchResult`;
- mark the match and participants completed;
- create XP and ranking settlement events with unique idempotency keys.

XP and ranking are separate systems. Do not treat speed bonuses or match score as ranking points unless the ranking policy explicitly maps them. Guest-play eligibility and registered-user ranking rules must follow the identity/ranking contracts.

The prior match result must remain immutable. A rematch creates a new Match ID and independent settlement.

## 8. Live question generation dependency

NEXIRA V1 does not rely on a static question bank. Questions are generated on demand by the AI Question Generator.

- Generate and validate the first question in parallel with matchmaking/readiness work, before the shared round clock starts.
- The same canonical question package and canonical option IDs must be used for both 1v1 participants; localization may differ per participant.
- Do not start a round with an incomplete, invalid, or unvalidated question package.
- Do not wait indefinitely for generation. Use bounded retries and a configured fallback generation path; if no valid question can be prepared within the operational budget, cancel the pending match safely and report a recoverable technical failure rather than starting a broken round.
- Later-round generation should be prepared ahead of the next round transition where possible, without exposing the next question or starting its timer early.
- Rematches must exclude the previous match's question IDs and normalized content fingerprints. Generate genuinely new questions; do not silently reuse an old question because no static bank exists.

The generation service must remain provider-independent, versioned, observable, and isolated from Match/Scoring business logic.

## 9. Required tests and release gates

### Deterministic scoring
- all speed-band boundaries: 2,999 / 3,000 / 4,999 / 5,000 / 6,999 / 7,000 ms;
- correct vs incorrect outcomes;
- no speed bonus for incorrect answers;
- duplicate finalization and duplicate ledger-write prevention.

### AI Judge
- exact and equivalent correct answers;
- synonyms, alternate phrasing, harmless spelling variations;
- materially incorrect answers and missing required concepts;
- ambiguous answers returning `UNCERTAIN`;
- prompt-injection attempts embedded in participant text;
- malformed provider output, timeout, rate limit, retry exhaustion, and fallback;
- versioned policy reproducibility.

### Lifecycle and concurrency
- answer submission racing with deadline processing;
- judge completion racing with round finalization;
- simultaneous finalization attempts;
- no-response streak reset after a valid answer;
- technical/void round excluded from no-response penalties;
- the three no-response penalties total exactly -20 for the forfeiting participant; no additional -20 deduction is applied at forfeit;
- the remaining participant receives exactly one +20 transfer credit;
- retries/recovery cannot duplicate any of the three penalties or the transfer credit;
- surrender/forfeit settlement is atomic and idempotent;
- match result, XP, and ranking settlement idempotency.

### Release gates
- PostgreSQL integration tests for row locks and race conditions;
- no client-controlled correctness or score;
- no answer key/rubric leakage before reveal;
- operational metrics and alerts for judge/generator failure;
- manual two-client 1v1 verification;
- real AI Question Generator and real AI Judge providers connected before public release.

## 10. Implementation sequence

1. Implement the scoring and cumulative no-response/forfeit accounting exactly as locked in NEX-BE-006 Version 1.1; do not add a second -20 deduction.
2. Define typed internal AI Judge port, provider adapter, strict schema, and policy versioning.
3. Implement deterministic multiple-choice adjudication and free-text AI adjudication.
4. Implement transactional scoring and idempotent score ledger writes.
5. Implement explicit no-response processing and consecutive-penalty state.
6. Implement round finalization, then match finalization and settlement.
7. Add bounded generation/judge recovery, observability, and end-to-end verification.

No production code should be considered complete until the tests and release gates above pass.
