# NEXIRA — Cross-Locale 1v1 Delivery Architecture

- Decision ID: NEX-L10N-ADR-001
- Status: APPROVED PRODUCT DECISION / TECHNICAL CONTRACT TO IMPLEMENT
- Date: 2026-11-19
- Target: V1 release
- Source of truth: `main` and `docs/LOCALIZATION_GLOBALIZATION_AUDIT.md`

## 1. Decision

NEXIRA V1 must support public 1v1 matches between players who selected different UI/game languages.

The matchmaking compatibility key is the normalized game category, not the selected language. A participant's selected language is retained as a participant-level locale snapshot for the duration of the match.

Both participants must receive the same semantic question, difficulty, time limit, answer identity, option identity/order, round start, and deadline. Each participant sees the question, options, hints, and explanation in their own selected locale. A language difference must never change scoring, accepted answer meaning, or competitive conditions.

## 2. Product locale contract

- The one persisted `settings.language` is authoritative for the complete experience.
- At match creation, snapshot each participant's selected locale. A later profile setting change applies to future matches and must not mutate an active match.
- Never introduce a separate user-facing match-language setting.
- All 20 approved V1 locales are mandatory for release: `en, fa, ar, es, fr, de, pt, ru, tr, hi, id, ja, ko, zh-CN, bn, ur, it, nl, th, vi`.
- All 20 must have complete local UI dictionaries and complete supported game-content delivery before being selectable in the release APK.
- UI translation is bundled/local and must work offline.
- AI game content must not be authored in English and then translated as a runtime fallback.

## 3. Semantic question model

A match round has one immutable semantic question identity and one answer contract. The server stores a canonical semantic representation that is not exposed as a participant-facing language choice.

For each participant locale, the content service must provide a localized rendering containing:
- localized prompt;
- localized answer options, preserving stable option IDs and order;
- localized hints/explanation where present;
- locale-appropriate script and punctuation;
- the same underlying correct option ID or semantic expected-answer concept.

The two renderings are not two independently authored questions. They are locale variants of one semantic question. Validation must prove equal meaning and preserve option IDs, answer identity, category, difficulty, and time limit.

The existing question-generation adapter's single-language contract is insufficient by itself for cross-locale 1v1. Extend the generation/content contract so a round can safely provide all participant locale variants, or use a separately versioned localization adapter with strict semantic equivalence validation. Do not simply send the first enqueued player's language to both clients.

## 4. AI Judge contract

- Multiple-choice correctness is determined by the stable answer/option ID on the server, never by comparing translated display strings.
- Free-text judging uses the participant's locale snapshot and that participant's localized question plus the corresponding locale-aware grading rubric/expected-answer representation.
- The Judge must assess semantic equivalence in the participant's language and accept common synonyms, inflections, spelling/script variants, and equivalent wording where appropriate.
- The Judge must not assume English or silently translate the participant response into English.
- The server remains authoritative for answer acceptance, deadlines, score, and final result.
- Judge requests and audit records must identify the locale and policy/model version used for each participant response.

## 5. Matchmaking and persistence changes required

Current implementation uses `(category, language)` as the public queue compatibility bucket and rejects locales outside `en/fa`. This must change.

Required behavior:
1. Validate the participant locale against the complete enabled-locale registry.
2. Lock the category compatibility bucket, not a category+locale bucket.
3. Pair FIFO across locales within the same category, while retaining self-match prevention, active-session checks, idempotency, cancellation serialization, expiry, and atomic queue-to-match creation.
4. Persist each participant's locale snapshot on a suitable existing participant/session snapshot model. Add a migration only after schema audit proves the exact field and migration shape.
5. Persist or deterministically recover the localized question variants required by every participant in the match. A reconnect must return the same locale variant and same semantic question.
6. Preserve queue locale in status/recovery responses for that caller.
7. Keep all notifications post-commit and non-authoritative.

Do not alter the established principal-lock ordering or transaction guarantees without proving the race behavior with PostgreSQL integration tests.

## 6. API and privacy requirements

- The authenticated caller receives only their own localized question payload.
- A participant must never receive the opponent's response, private judge rationale, or hidden answer before the round is finalized.
- Match snapshots may expose safe participant presentation data, but not private identity/session fields.
- Locale is presentation/content metadata, not a security boundary.
- REST snapshots remain authoritative; socket notifications are recoverable hints.

## 7. Required regression and integration coverage

- Same-locale pairing still works.
- Cross-locale pairing works for all allowed locale pairs without changing category compatibility.
- Different categories never pair.
- A participant cannot pair with another session of the same principal.
- Each participant receives their own locale rendering for the same question ID.
- Both renderings preserve stable option IDs/order and the same correct answer identity.
- Both participants receive the same round start and deadline.
- Multiple-choice scoring uses answer IDs, not translated strings.
- Free-text Judge receives the correct participant locale and corresponding localized rubric.
- RTL/LTR pairs (fa/ar/ur against en/es/de) render correctly.
- Reconnect, cold-process recovery, and question-read endpoints preserve the locale snapshot.
- Changing profile locale during an active match does not change that match's content.
- Cancellation/pairing, guest conversion, and match settlement races remain correct.
- No response or score is leaked between participants.

## 8. Release gates

This decision is not implemented merely by changing the queue key. The section is complete only when:
- all 20 locales are complete and enabled in the APK;
- all backend and frontend regression tests pass;
- PostgreSQL migrations/integration tests pass;
- Android build and APK verification pass;
- cross-locale two-device acceptance passes;
- the actual installed APK is checked for language selection, persistence, RTL/LTR, gameplay, reconnect, and results.

Until then, public 1v1 feature flags remain disabled in production.
