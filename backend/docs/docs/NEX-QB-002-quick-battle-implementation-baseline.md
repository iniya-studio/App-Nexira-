# NEX-QB-002 — Quick Battle Implementation Baseline

Status: In progress  
Branch: `feature/quick-battle-foundation`  
Base: `main` at `8e62179ddfdec465ba2123f2b7ebbbf576bd3260`

## Purpose

Implement Quick Battle as a distinct competitive experience while reusing NEXIRA's existing 1vAI match lifecycle, AI question generator, AI judge, server-authoritative clock, scoring pipeline, recovery, and settlement infrastructure. Do not create a parallel game engine.

## Confirmed product decisions

- Quick Battle is a separate player-facing experience from standard 1vAI.
- It is a fast, direct-entry match against AI; no category or subcategory selection by the player.
- Each match contains 10 questions.
- Questions are generated dynamically by AI for the match; production must not depend on fixture questions.
- Questions are drawn across the 23 supported NEXIRA categories, with category repetition avoided within a match where possible.
- AI-generated questions pass validation before they can enter a live round. Invalid questions are rejected and replaced.
- The AI question generator and AI answer judge remain separate responsibilities.
- Questions should be prepared ahead of display so provider latency does not consume the player's answer time. The initial proposal is to prepare the first three questions and continue generating in the background; implementation must preserve server-side readiness and deadlines.
- The server remains authoritative for question persistence, deadlines, answers, scoring, match completion, and results.
- Reuse the existing 1vAI scoring and judging pipeline as the initial technical baseline. Any changes to scoring or answer time require an explicit product decision.
- Free 1vAI remains available and must not be weakened to promote Quick Battle.
- Quick Battle competitive events are short, independent, time-boxed events (candidate formats: 24 hours, 48 hours, and weekends), not long seasons.
- Each event has its own ranking and winners. Past honors remain visible in user profiles.
- Event durations, cadence, event ranking formula, prizes, entry pricing, payment settlement, and refunds remain open design decisions. Do not hard-code them in this foundation.

## Reliability and fairness requirements

- Repeated start requests must not create duplicate active Quick Battle matches for the same principal.
- Reconnection must restore the persisted match state without losing accepted answers or scores.
- The server clock continues independently of client connectivity.
- Intentional abandonment and technical failures must be distinguished. The exact reconnect grace period and forfeit policy remain to be finalized.
- Server/provider failures must not be treated as player losses. Invalid matches must not contribute competitive results; payment/refund behavior is deferred until payment design is approved.
- Client-submitted scores, deadlines, winner declarations, or question content are never authoritative.
- Match and event settlement must be idempotent and protected against duplicate submissions.
- Anti-cheat, collusion detection, ties, and event eligibility require dedicated implementation stages.

## Implementation sequence

1. **Match-domain foundation:** represent Quick Battle distinctly from standard 1vAI without duplicating the match engine; add a dedicated authenticated entry/recovery API and tests.
2. **Question distribution:** choose categories across all 23 categories with no repeats where possible; persist the chosen category in each generation job so retries are deterministic.
3. **Question pipeline:** prepare upcoming questions in advance, validate every generated question, and replace invalid or failed generation jobs safely.
4. **Match lifecycle:** reconnect, abandonment, server/provider failure, technical void, and idempotent finalization.
5. **Competitive events:** short event windows, participant eligibility, independent ranking, ties, and historical honors.
6. **Payments and rewards:** only after product decisions and legal/payment feasibility review; no competitive advantage from payment.
7. **Client experience:** connect the Quick Battle home entry, match flow, result, event pages, and ranking to the server APIs.
8. **Verification:** unit/integration tests, migration validation, CI, and Android build/regression checks.

## Scope guardrails

- Do not remove or weaken existing 1v1 or standard 1vAI behavior.
- Do not use fixture questions in production Quick Battle.
- Do not introduce long seasons as a requirement.
- Do not finalize prices, event schedules, prizes, or refund policy by inference.
- Do not merge this feature branch into `main` without the user's explicit approval.
