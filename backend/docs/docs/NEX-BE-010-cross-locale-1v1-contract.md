# NEX-BE-010 — Cross-Locale 1v1 Question Delivery Contract

**Status:** Approved architecture; implementation in progress (participant snapshots, category-only pairing, locale-complete generation, participant-specific delivery and Judge routing committed; execution evidence pending)
**Target branch:** `main`
**Scope:** Participant locale snapshots, shared semantic questions, localized delivery, answer identity, AI Judge context, matchmaking compatibility, reconnect and recovery.
**Depends on:** NEX-BE-006 Match Core, NEX-BE-007 Match Entry API, NEX-BE-008 AI Judge, NEX-BE-009 Public 1v1 Matchmaking, L10N-02A.

## 1. Product invariant

A player's single persisted `settings.language` controls their complete experience. In a cross-locale 1v1, both participants answer the same semantic question under the same difficulty, answer identity, timing and scoring rules, while each sees the question and choices in their own locale.

Locale is a presentation and evaluation context, never a matchmaking advantage or a different question.

## 2. Immutable participant locale snapshot

- Add a required `language` (or equivalently named canonical locale ID) to `MatchParticipant` for HUMAN participants.
- Snapshot the locale from the authenticated principal's trusted profile/settings at enqueue time; never trust a client-supplied opponent locale.
- Guest enqueue locale is validated against the server's enabled locale registry and is persisted on its queue entry.
- At pairing, copy each queue entry's locale to its corresponding MatchParticipant in the same transaction that creates the match and consumes both entries.
- For ONE_V_AI, snapshot the requesting principal's locale on the human participant.
- Locale changes after match creation must not mutate an active match. Reconnect and recovery always use the stored snapshot.
- AI participants have no user locale; their presentation is not a participant-facing language source.

## 3. Queue compatibility and concurrency

- Compatibility key is normalized `category` only. Locale must not be part of the advisory-lock bucket, candidate SQL predicate, expiry bucket predicate or compatibility index.
- Preserve principal-level serialization and row locking. Pairing remains atomic and FIFO among compatible entries.
- Every queue entry retains its own locale. A paired match can contain two distinct locales.
- Cancel and enqueue must use the same category bucket lock order. Tests must cover concurrent cross-locale enqueues, cancellation races and self-pair prevention.
- Reject unsupported locale IDs before opening the transaction.

## 4. One semantic question, multiple locale renderings

- Generate one semantic question object for a match round, not a different question per participant.
- The generated object has one stable question identity and one canonical answer identity. Multiple-choice option IDs and order are invariant across every locale rendering.
- Persist a locale-keyed rendering map in the existing `Question.localized` JSON (or an additive normalized table if validation/indexing needs justify it). Each rendering includes prompt, option text, and localized grading context/explanation where applicable.
- Generation input must include the immutable set of HUMAN participant locales for the match. The generator must author every requested rendering directly in its target language; no English-first translation chain and no English fallback for an enabled locale.
- Canonical semantic content, answer key, rubric concepts and difficulty are shared. Localized renderings may change wording and culturally appropriate examples only when semantic equivalence, answer identity and difficulty are preserved.
- Validate exact locale coverage, option-ID parity/order, required fields and semantic consistency before persisting/attaching the question. Missing rendering is a generation failure, not permission to display another language.
- For 1vAI, requested locale set contains the human participant locale. Existing English/Persian behavior remains compatible during migration.

## 5. Participant-specific read contract

- Every question read/delivery endpoint resolves the authenticated participant's immutable locale snapshot server-side.
- Return the same question/round identifiers, deadline, option IDs/order and answer type to both players; return only the matching locale's prompt and option text.
- Do not accept a caller-selected locale query parameter as authority once a match participant snapshot exists. A legacy query parameter may be temporarily accepted only for non-match/legacy compatibility and must never override the participant snapshot.
- Reconnect, round recovery, match snapshots and subsequent rounds use the same participant-locale resolution.
- Internal canonical answer key, rubric, hidden translations and other participant renderings must not be leaked in public question payloads.

## 6. Answer submission and AI Judge

- Multiple-choice answers continue to submit stable option IDs; the server maps IDs to the canonical answer identity. Localized option text is never trusted as the answer key.
- Free-text judging resolves the submitting MatchParticipant's locale from the persisted match snapshot.
- Judge input includes canonical semantic question identity, the participant-locale rendering, locale-appropriate rubric representation, expected answer semantics, and the participant response.
- Judge must assess meaning in that locale, must not assume English or translate through English, and must not accept locale text supplied by the client as authoritative context.
- Score, elapsed time, deadline, retry/idempotency and final result remain server-authoritative and unchanged by locale.

## 7. Migration and compatibility

- Additive migration only. Existing MatchParticipant rows receive a deterministic backfill from the associated user's preferred locale where available, otherwise the match/question generation locale, with a documented safe default for historical guest rows.
- Historical questions remain readable through the existing canonical/localized data contract. Do not rewrite historical answers or score records.
- Keep current `en` and `fa` paths working throughout rollout. Enable additional locales only after their complete UI pack, question generation coverage, Judge QA and integration tests pass.
- Do not enable public cross-locale matchmaking in production until all backend and frontend release gates pass.

## 8. Required automated acceptance

1. Same-locale and cross-locale (LTR/LTR, RTL/RTL, LTR/RTL) 1v1 pairing succeeds for equal categories.
2. Different categories never pair; locale difference alone never prevents pairing.
3. Each participant receives the same semantic question and identical question/round IDs, option IDs/order, answer type, deadline and difficulty, but sees only their own locale rendering.
4. Each participant's language snapshot survives profile language changes, reconnect and recovery.
5. A missing/invalid locale rendering blocks question publication; no silent English/canonical fallback.
6. Multiple-choice stable IDs map to the same correct answer across all renderings.
7. Free-text Judge receives the correct participant locale and corresponding localized question/rubric; cross-locale answers are judged semantically.
8. No participant can read another participant's private answer or hidden question fields.
9. Existing 1vAI, same-locale 1v1, settlement, scoring and idempotency tests remain green.
10. PostgreSQL migration, unit tests, integration tests, backend CI and Android/client contract tests pass before release activation.

## 9. Implementation sequence

- 02A.1 — Implement and test server locale registry (20 target IDs) and trusted principal locale resolution.
- 02A.2 — Add MatchParticipant locale snapshot and additive migration/backfill.
- 02A.3 — Make matchmaking category-only while retaining per-entry locale.
- 02A.4 — Expand generation context to all HUMAN participant locales; generate one semantic question with locale-specific prompt, expected answer, option text and grading rubric; reject duplicate/missing locales and option-ID/order mismatches. (Implementation committed; CI evidence pending)
- 02A.5 — Resolve participant locale in question delivery and free-text Judge processing from the immutable participant snapshot; ignore caller locale for match question reads and reject missing cross-locale renderings. (Implementation committed; integration evidence pending)
- 02A.6 — Add cross-locale PostgreSQL integration and security regression tests for same semantic question delivery, stable option IDs, server-authoritative locale and localized Judge input. (Regression tests committed; execution pending)
- 02A.7 — Enable only after CI and release gates are evidenced.

No implementation item is DONE solely because this contract exists.
