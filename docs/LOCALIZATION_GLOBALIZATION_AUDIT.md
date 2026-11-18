# NEXIRA Global Localization Audit

**Status:** Audit baseline — implementation not yet complete  
**Branch:** `main`  
**Audit basis:** Current `main` source inspected on 2026-11-19  
**Scope:** Frontend locale selection, translation coverage, persistence, directionality, formatting, game content, and test gates.

## Verified baseline

- `app/src/i18n.js` currently exports only two complete UI dictionaries: `en` and `fa`.
- `getCopy(language)` silently falls back to English for every unknown locale.
- `getQuestionCopy(language, ...)` only selects Persian question copy; all other locales receive the original question.
- `app/src/game/data.js` normalizes persisted language to exactly `fa` or `en`; any other value is rewritten to English.
- `app/src/App.jsx` reads the selected locale through `getCopy`, but also contains many inline `language === 'fa'` branches. The source audit found 135 locale-sensitive matches, including hard-coded UI copy, number formatting, matchmaking language labels, and direction handling.
- Document direction is currently RTL only for `fa`; all other values are LTR.
- The language screen in `app/src/App.jsx` uses a registry-driven selector; only the complete locales currently in the registry (English and Persian) are selectable.
- Existing tests in `app/src/i18n.test.js` assert parity only between English and Persian. They also verify current Persian question coverage and UI references.
- The current question dataset has Persian translations for the existing categories; other locales do not have localized question packs.
- The language-selection description now states that the entire game, including match questions, uses the user's selected language.
- The current language setting is persisted in the profile settings. Initial language selection has a separate completion marker and should remain backward-compatible.

## CI baseline

GitHub Actions run `44394690367` (Build and verify Android debug APK) completed successfully. Its job completed all primary steps successfully, including dependency installation, frontend/match-engine tests, web/Android build, APK verification, and artifact upload. This is a verified baseline only; future commits require their own CI result.

## Required architecture

1. **Single locale registry:** canonical locale ID, native display name, English display name, text direction, Intl locale tag, and availability metadata must live in one source of truth.
2. **Strict locale validation:** persisted values must be validated against fully supported locale packs. Unknown or malformed values must recover deterministically without corrupting the saved profile.
3. **Complete translation contract:** every enabled locale must provide every required UI key and nested key. Missing translations must fail tests; silent English fallback must not make an incomplete locale appear supported.
4. **Feature coverage:** include all visible app surfaces, settings, validation/error states, matchmaking, match flow, rankings, profile, store, dialogs, accessibility labels, and empty/loading states.
5. **Single user-selected language:** one persisted locale (`settings.language`) controls the complete user experience, including interface copy and match content. A separate match-language preference is not part of the product architecture.
6. **AI game-content language:** AI question generation must receive the user's selected locale and generate the prompt, options, correct answer, hints, and explanation directly in that language. AI Judge must evaluate against the same language and semantic meaning. Correct-answer identity/order must remain invariant.
7. **Direction and formatting:** derive document and component direction from locale metadata. Use `Intl.NumberFormat`, `Intl.DateTimeFormat`, and locale-aware plural/message formatting where applicable.
8. **Accessible selector:** replace the two-card chooser with a searchable/selectable locale control that presents native language names and preserves the selected locale.
9. **Regression gates:** test registry integrity, translation-key parity, nested structures, question/answer invariants, locale persistence/migration, RTL/LTR behavior, formatting, selector options, and absence of accidental fallback for enabled locales.

## Candidate V1 locale set

The following 20 locales are the proposed global V1 target, subject to complete translation and QA before being marked supported:

| Locale | Native label | Direction |
|---|---|---|
| en | English | LTR |
| fa | فارسی | RTL |
| ar | العربية | RTL |
| es | Español | LTR |
| fr | Français | LTR |
| de | Deutsch | LTR |
| pt | Português | LTR |
| ru | Русский | LTR |
| tr | Türkçe | LTR |
| hi | हिन्दी | LTR |
| id | Bahasa Indonesia | LTR |
| ja | 日本語 | LTR |
| ko | 한국어 | LTR |
| zh-CN | 简体中文 | LTR |
| bn | বাংলা | LTR |
| ur | اردو | RTL |
| it | Italiano | LTR |
| nl | Nederlands | LTR |
| th | ไทย | LTR |
| vi | Tiếng Việt | LTR |

A locale is not considered enabled merely because it appears in this table or in the selector. It becomes selectable only after its complete UI and game-content pack passes the required automated checks and language QA.

## Implementation sequence and exit criteria

### L10N-01 — Locale foundation
- Add the central locale registry and strict locale helpers.
- Preserve existing `en`/`fa` user settings and initial-selection behavior.
- Make direction and Intl formatting derive from locale metadata.
- Add migration and invalid-locale tests.
- **Exit:** existing English/Persian behavior remains intact; locale validation and migration tests pass.

### L10N-02 — Single-locale propagation and remove two-language assumptions
- Use the one persisted `settings.language` value across interface, matchmaking, question generation, match recovery, and AI Judge contracts.
- Inventory and migrate inline locale branches and feature-local bilingual data to translation namespaces.
- Keep UI translations bundled/local; runtime UI rendering must not depend on AI or network translation.
- **Exit:** no separate match-language preference exists; all match requests carry the selected user locale; all visible UI strings use the local translation contract.

### L10N-03 — Complete locale packs
- Complete every UI namespace and game-content pack for each target locale.
- Validate native labels, terminology, placeholders, pluralization, text expansion, and RTL rendering.
- **Exit:** every target locale passes strict key parity, question coverage, and locale QA; only then can it be enabled.

### L10N-04 — Release gates
- Add automated checks that fail if an enabled locale is missing UI copy or AI language-contract coverage.
- Verify language switching, persisted selection, selected-locale propagation to matchmaking and AI generation/Judge, and representative screens for every locale.
- **Exit:** full frontend test suite and Android build pass on the resulting `main` commit.

## Non-negotiable acceptance rules

- No disabled/placeholder language options in the production selector.
- No locale may be marked supported while it falls back to English for missing UI or game content.
- English and Persian must remain backward-compatible.
- Language changes must not alter score logic, answer identity, match authority, or matchmaking correctness.
- Do not claim a language or release gate is complete without recorded test/CI evidence.


## L10N-02 — Single selected language architecture correction

- Product decision: one user-selected locale controls the entire game experience, including UI and match content.
- UI translations are bundled/local data and must never require an AI or network translation request at runtime.
- AI question generation receives the selected locale and is explicitly instructed to author the canonical prompt/options, free-text expected answer, grading rubric, and localized display fields directly in that language; it must not draft in English and translate afterward.
- AI Judge receives the generated question's authoritative language and is explicitly instructed to interpret the question, expected answer, rubric, and participant response in that language rather than assuming English.
- Adapter regression tests now cover both English and Persian request-language contracts. These tests are added but remain unexecuted until CI reports a result.
- Matchmaking and account/profile language validation currently allow only `en` and `fa`; other candidate locales remain disabled until complete UI packs, backend validation, question generation, Judge QA, and locale-specific tests are ready.
- The temporary independent `settings.matchLanguage` implementation has been removed from profile normalization and match request construction.
- Existing `settings.language` persistence and initial language-selection completion behavior remain the source of truth.
- Supported locales remain limited to complete, verified locale packs; the candidate 20-language list is not an activation list.
- Corrective code commits have been recorded; test execution and CI evidence remain pending until a workflow run reports results.
