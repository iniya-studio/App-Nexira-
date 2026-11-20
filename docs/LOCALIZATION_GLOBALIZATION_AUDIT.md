# NEXIRA Global Localization Audit

**Status:** Approved V1 release scope — 20 locales required; multilingual cross-locale 1v1 approved; implementation not yet complete  
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

The following 20 locales are the mandatory global V1 release target. All 20 must have complete UI and game-content support, pass automated checks and language QA, and be enabled in the release APK. Partial rollout or silently disabled entries do not satisfy the approved release scope:

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

Release requirement: all 20 entries must be selectable in the final APK only after their complete UI and game-content packs pass the required automated checks and language QA. The implementation sequence must deliver the full set before this localization section can be closed.

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
- Historical baseline note (superseded by the approved release decision below): public 1v1 originally used `(category, language)` as its compatibility bucket. Cross-locale 1v1 is now approved; implementation must follow the participant-specific locale snapshot and semantic-question contract in the approved decision and revised execution order.
- The temporary independent `settings.matchLanguage` implementation has been removed from profile normalization and match request construction.
- Existing `settings.language` persistence and initial language-selection completion behavior remain the source of truth.
- Supported locales remain limited to complete, verified locale packs; the candidate 20-language list is not an activation list.
- Corrective code commits have been recorded; test execution and CI evidence remain pending until a workflow run reports results.


## Approved release decision — 20 locales and cross-locale 1v1

**Decision status:** APPROVED by product owner on 2026-11-19.

- The complete 20-locale candidate set above is the V1 release requirement, not a future wish list.
- The final Android APK must expose all 20 native language names in the language selector; every option must actually work across the complete app and game flow.
- One persisted `settings.language` controls UI, menus, validation, match content, options, answers, explanations, results, and accessibility copy.
- UI dictionaries remain bundled/local. No runtime network or AI translation is permitted for interface copy.
- AI-generated match content must preserve one semantic source question and stable answer/option identity while providing participant-specific language renderings. Both players receive identical meaning, difficulty, timing, and answer identity, but text is rendered in each player's selected locale.
- Free-text answers are judged against the same semantic rubric using the responding participant's selected locale. Judge inputs must include the participant locale and the corresponding localized question/rubric representation; English must not be assumed as an intermediate language.
- Public 1v1 compatibility is category-based, not locale-based. Each queue entry retains the participant locale for delivery and judging. Locale is not a reason to exclude otherwise compatible players.
- The match must snapshot the participating locales at match creation so later profile-language changes cannot mutate an active match.
- Acceptance requires cross-locale integration tests (at minimum all RTL/LTR pairings represented), same semantic question/option IDs/deadlines, correct per-player language delivery, correct per-player Judge locale, reconnect/recovery consistency, and no answer/score leakage.
- Do not close L10N-03 or L10N-04 until all 20 locales are complete and enabled, the full frontend/backend tests pass, and a release APK has been built and manually checked.

## Revised execution order

1. **L10N-02A — Cross-locale match contract:** define canonical semantic question identity, per-participant locale snapshots, localized question payloads, answer option identity, Judge context, queue compatibility, reconnect and result contracts. No code shortcut that changes the semantic question per player.
2. **L10N-02B — Backend multilingual delivery:** update matchmaking compatibility, match participant locale snapshots, generation/localization persistence and read APIs, Judge routing, and migrations additively with PostgreSQL integration coverage.
3. **L10N-02C — Frontend locale propagation:** remove all inline en/fa branches, route all visible copy through namespaces, support all RTL locales (fa/ar/ur) and locale-aware formatting.
4. **L10N-03 — Complete 20 local UI packs and 20 game-content packs:** translation completeness, terminology, placeholders, pluralization, question quality, and native-language QA.
5. **L10N-04 — Release gates:** all 20 selector entries enabled, strict tests, cross-locale 1v1 integration, frontend/backend CI, Android APK build, and device acceptance.

No section is DONE merely because its code or documentation was added. Evidence is required for every exit criterion.


---

## Re-audit — 2026-11-20 (supersedes conflicting historical source notes above)

**Reviewed main HEAD:** `7750bf6bb0a3d3c2d5b4a7a669c897e4f9719ea8`  
**Scope:** existing 20-locale foundation only; no translation pack was added or enabled during this audit.

### Verified as already implemented

- Frontend `app/src/locales.js` and backend `backend/src/common/localization/locale-registry.ts` each declare the same ordered 20 target locales, native/English names, Intl tags, and LTR/RTL metadata.
- Frontend/backend enablement remains `en` and `fa` only. The language selector is driven by `getSupportedLocales()`, so incomplete target locales are not selectable.
- The persisted source of truth remains `profile.settings.language`; profile normalization validates it and unknown/disabled values recover to English. The first-run language-selection completion marker is separate and preserved.
- `App.jsx` applies the selected locale to the document `lang` and `dir` attributes and to the application shell. RTL metadata exists for `fa`, `ar`, and `ur`.
- Locale-aware number/date formatter helpers already exist. Current visible statistics use the selected locale's Intl tag.
- The English and Persian UI dictionaries remain the only complete UI dictionaries. The static sample question set remains English/Persian preview/test content and is not being expanded as part of the AI-generated match-content localization path.
- Backend cross-locale match contracts, participant locale snapshots, localized question payload validation, and Judge locale handling are already implemented and have dedicated unit/integration coverage. Test fixtures exercise all 20 locale identifiers; this does not mean all 20 production translations/providers have been accepted or enabled.
- Frontend/backend locale metadata parity and enabled-set parity are covered by frontend tests.

### Foundation corrections made on this audit

- Removed the remaining hard-coded Persian/English matchmaking language label. It now resolves the participant language's native name from the locale registry.
- Replaced the settings summary's fixed “English / Persian” wording with a language-neutral label in both baseline dictionaries.
- Added frontend BCP-47 locale canonicalization using `Intl.getCanonicalLocales`, matching the backend normalization policy. Persisted `FA` now resolves to `fa`; canonical-but-disabled locales such as `zh-cn` remain disabled and resolve safely to the default locale.
- Added regression tests for native locale labels across the full target registry and frontend locale canonicalization.

### Remaining infrastructure gaps — must close before translation production is considered complete

1. **Script font coverage:** the app currently bundles only Inter and Orbitron. CSS names Noto Sans Arabic as a fallback, but no dedicated Arabic/Urdu, Devanagari, Bengali, Thai, Japanese, Korean, or Simplified Chinese font packages are bundled. Device fallback is not yet accepted as a production guarantee. Select and bundle appropriate script fonts, keep payload size reasonable, and verify glyph coverage on Android.
2. **RTL layout audit:** document and root direction propagation is present, but every screen, nested control, input, icon, spacing rule, and mixed-script value still needs a systematic RTL audit. Existing visual direction support is not equivalent to verified Arabic/Urdu acceptance.
3. **Plural/message formatting:** current `formatCopy` supports simple named interpolation only. Locale-specific plural selection and bidi-safe interpolation of mixed-direction values need a defined shared contract and tests before those patterns are used in new packs.
4. **Formatting coverage:** number/date helper behavior must be exercised for all 20 Intl tags, including representative Arabic/Persian digits, grouping, dates, and invalid input handling. Current use sites should be audited so locale formatting is consistently applied.
5. **UI literal/reference audit:** the current English/Persian dictionaries have recursive parity tests, but the complete production UI still needs a fresh source scan for unlocalized visible literals, hard-coded two-language assumptions, accessibility labels, and nested translation references.
6. **No-fallback content contract:** keep UI dictionaries and AI-generated match content separate. A locale must not become selectable until its full UI pack and the relevant generated-content/Judge path have passed locale-specific acceptance. The sample preview questions are not a substitute for production match content.
7. **Android visual acceptance:** font loading, line wrapping, text expansion, keyboard/input direction, and RTL/LTR layout must be checked on the actual Android build at supported phone sizes before any locale is enabled.

### Next execution order

- Complete the remaining foundation gaps above, reusing the current registry, persistence, direction propagation, backend match contract, and tests.
- Add reusable automated checks for script/font configuration, locale formatting, plural/interpolation behavior, UI literal coverage, and no-fallback content behavior.
- Only after the foundation gates are green, produce the first UI translation pack (`ar, es, fr`) and keep all three disabled until their own translation and visual QA passes.

**Status remains IN PROGRESS. No new locale has been enabled. No CI result or Android visual acceptance is claimed by this audit entry.**


### Foundation implementation update — 6707230d355ef6ee809e5edcf3c9515c4758c474

- Frontend locale normalization now uses `Intl.getCanonicalLocales`, and persisted locale resolution canonicalizes before checking enablement.
- Added `getLocalePluralCategory` as the shared `Intl.PluralRules` foundation.
- `formatCopy` now accepts the active locale and isolates interpolated dynamic values with Unicode FSI/PDI for RTL locales. The app timer/progress labels and account session-count notices now pass the active locale; account count values are also locale-formatted.
- Added automated coverage for number/date/plural formatting across all 20 target Intl tags and for RTL interpolation isolation. These are test additions only until the corresponding CI run completes.
- The earlier remaining-gap item “plural/message formatting” is now partially addressed: plural category selection and bidi-safe interpolation exist, but a full plural-message catalog contract and complete call-site audit remain open.
- The script-font, full RTL visual, UI literal, and Android device acceptance gaps remain open. No locale enablement change was made.

### Script-font architecture decision — 2026-11-20

Source inspection confirmed that the frontend currently imports only Inter Variable and Orbitron Variable. The `Noto Sans Arabic` family name in the theme is a fallback declaration only; no Arabic font package is currently bundled. Script-font support is therefore an actual foundation gap, not merely a visual polish item.

Approved font coverage matrix for implementation:

| Locale(s) | Script coverage | Candidate family |
| --- | --- | --- |
| `fa`, `ar` | Arabic script | Noto Sans Arabic Variable |
| `ur` | Urdu Nastaliq | Noto Nastaliq Urdu |
| `hi` | Devanagari | Noto Sans Devanagari Variable |
| `bn` | Bengali | Noto Sans Bengali Variable |
| `th` | Thai | Noto Sans Thai Variable |
| `ja` | Japanese | Noto Sans JP Variable |
| `ko` | Korean | Noto Sans KR Variable |
| `zh-CN` | Simplified Chinese | Noto Sans SC Variable |
| remaining locales | Latin / extended Latin / Cyrillic | Existing Inter Variable, subject to glyph QA |

Implementation constraints:

- Use self-hosted Fontsource packages under their published licenses; do not depend on a remote font CDN at runtime.
- Urdu must use its own Nastaliq family rather than treating generic Arabic sans as an equivalent Urdu typographic solution.
- Load script families on demand by selected locale, not as a global eager font stack. Keep the CSS unicode-range/subset behavior where supported.
- Measure Vite build output and final Android APK size before acceptance. CJK font packages can materially affect shipped asset size; do not accept an unmeasured size regression.
- Preserve fallback stacks for unsupported glyphs and user-generated/AI-generated text. Font presence alone does not prove correct shaping or visual quality.
- Validate representative glyphs, diacritics, combining marks, punctuation, numerals, mixed Latin/script text, and line-height/overflow on Android WebView.
- Generate `package-lock.json` through npm in the project environment in the same change as `package.json`; never hand-edit lockfile metadata.

Candidate package names were checked against Fontsource package documentation: `@fontsource-variable/noto-sans-arabic`, `@fontsource/noto-nastaliq-urdu`, `@fontsource-variable/noto-sans-devanagari`, `@fontsource-variable/noto-sans-bengali`, `@fontsource-variable/noto-sans-thai`, `@fontsource-variable/noto-sans-jp`, `@fontsource-variable/noto-sans-kr`, and `@fontsource-variable/noto-sans-sc`.

**Status:** architecture selected; package installation and runtime implementation have not yet been committed. No locale is enabled by this font decision.