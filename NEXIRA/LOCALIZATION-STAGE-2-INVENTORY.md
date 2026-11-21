# NEXIRA Localization — Stage 2 Source Inventory

Status: L3 translation production in progress  
Baseline branch: `main`  
Baseline commit inspected: `7f00118f585347e503a9bb2b7152ad0728b07440`  
Target locale order: `en, fa, ar, es, fr, de, pt, ru, tr, hi, id, ja, ko, zh-CN, bn, ur, it, nl, th, vi`

## Confirmed source surfaces

| Surface | Source of truth | Current evidence | Work required |
|---|---|---|---|
| Locale registry | `app/src/locales.js` | 20 target locales; only `en` and `fa` enabled | Keep enablement closed until release gates pass |
| UI copy | `app/src/i18n.js` → `COPY` | English and Persian dictionaries; dictionary section is about 53 KB | Translate every nested leaf for the 18 remaining locales; preserve key and placeholder parity |
| Category labels | `app/src/game/categoryCatalog.js` + `app/src/game/categoryTranslations.js` | Complete offline category names, subtitles and all 115 subcategory labels added for Spanish and French; automated coverage test added | Add the remaining 16 locale packs, integrate them into locale copy, and verify every key against the canonical catalog |
| Question content | `app/src/game/questionFixtures.js` + `app/src/game/questionTranslations.js` + `PERSIAN_QUESTIONS` in `app/src/i18n.js` | 24 stable question IDs; offline prompt/options packs added for all 18 non-baseline locales; automated coverage test enumerates all 18 packs | Review translation quality and verify semantic correctness; preserve IDs, order, option count, and answer index |
| Local match delivery | `app/src/game/localMatchAdapter.js` | Question packages now derive localized copies from every currently enabled locale rather than hard-coding Persian; selected participant locale is still enforced by the match engine | Once locale packs are complete and enabled, verify all 20 locales flow through the same package resolver |
| UI integration | `app/src/App.jsx`, `app/src/components/AccountSessionPanel.jsx` | App consumes centralized copy; App source is about 93 KB | Audit all rendered text, attributes, accessibility labels, placeholders, and conditional states for hardcoded literals |
| Frontend tests | `app/src/i18n.test.js` | Question pack coverage for 18 locales; Spanish/French category pack coverage; recursive en/fa key and placeholder parity checks added | Extend complete key/placeholder coverage to every locale and audit all visible UI literals |
| Backend locale policy | `backend/src/common/localization/locale-registry.ts` | Target registry exists; enabled set is en/fa | Maintain exact frontend/backend target and enablement parity |

## Confirmed counts

- Target locales: 20
- Currently enabled locales: 2 (`en`, `fa`)
- Product categories: 23
- Subcategories: 115
- Legacy question fixtures: 24
- Question translation packs: English canonical fixtures, Persian translations, and 18 non-baseline locale packs
- Category translation packs: Spanish and French (full 23-category / 115-subcategory coverage); other locales pending

## Important implementation constraints

1. Do not enable any of the 18 incomplete locales.
2. Do not copy English values into a non-English pack as placeholders.
3. Keep UI dictionaries separate from gameplay content.
4. Preserve stable IDs, question order, option order/count, answer indexes, scoring, timers, and match semantics.
5. Localize safe API error codes only; never expose raw server/provider exception messages.
6. Keep all work on `main`; inspect current `main` and the latest file SHA before each write.

## Inventory items still requiring source-level audit

- Exhaustive scan of `App.jsx` and all production components for user-visible literal text in JSX, attributes, accessibility labels, tooltips, and conditional branches.
- Verify whether any additional production UI copy is sourced outside `COPY` (including component-local constants and HTML metadata).
- Inventory every shipped player-facing mode/difficulty/explanation string in the gameplay content layer.
- Verify all backend-generated/player-facing values are returned as stable codes or IDs and localized client-side.

## Exit criteria for L0

L0 is complete only after the remaining source-level audits above are recorded and every production-visible string/content source has an owner and stable translation key or content ID. Translation production must not be declared complete from dictionary parity alone.

## L0 source-level UI audit — 2026-11-21

### Files inspected directly on `main`

- `app/src/App.jsx` — main production UI and inline screen/component markup (95 KB source).
- `app/src/components/AccountSessionPanel.jsx` — account/session UI component.
- `app/src/i18n.js` — centralized English/Persian copy source (referenced by the existing inventory and UI).
- `app/index.html` — document title and description fallback metadata.
- `app/src/game/categoryCatalog.js` — category and subcategory IDs.
- `app/src/game/questionFixtures.js` — canonical question fixtures.
- `app/src/game/localMatchAdapter.js` — local match content delivery.
- `app/src/i18n.test.js` — current localization contract tests.

### Confirmed findings from the rendered UI audit

| Finding | Location | Classification | Required action |
|---|---|---|---|
| Home mode labels `1vs1` and `1vsAI` are literal JSX text | `App.jsx` home mode cards | Product notation / visible label | Decide and document as intentionally invariant labels, or move to dictionary if localized wording is required |
| Quick Battle preview category title is hard-coded as `Quick Battle` | `App.jsx` `quickBattlePreviewCategory` | Player-facing gameplay metadata | Use the existing localized Quick Battle label or a stable localized content key |
| Quick Battle preview mode is hard-coded as `Speed Sprint` | `App.jsx` `quickBattlePreviewCategory.modes` | Player-facing gameplay metadata | Add a localized mode label/key; do not let the raw fallback reach match UI |
| Quick Battle preview uses the category ID `quick-battle-preview` | `App.jsx` | Internal stable ID | Keep invariant; ensure display labels are resolved from locale copy |
| Initial HTML title/description are English fallbacks | `app/index.html` | Document metadata fallback | Runtime updates `document.title` and meta description from selected locale copy; verify metadata is correct after locale initialization |
| Account/session component contains no detected user-facing English JSX literals | `AccountSessionPanel.jsx` | Centralized copy usage | Continue to require all account text through the supplied localized `copy` object |

### Literal-text classification rules

- Brand name `NEXIRA`, stable IDs, protocol/error identifiers, CSS classes, and technical notation are not translation strings by default.
- `1vs1` and `1vsAI` are visible product-mode notation; they remain an explicit localization decision rather than silently being counted as translated copy.
- Error messages used only for logs or internal exceptions are not player-facing copy. Player-facing errors must resolve through stable error codes and localized dictionary entries.
- Any fallback such as `General` or a raw mode ID that can appear in rendered match/result UI must be replaced by a localized fallback before L0 can close.

### Remaining L0 audit gates

1. Trace every player-visible category/mode/subcategory label from its data source to its rendered UI; confirm no raw IDs or English fallbacks are displayed.
2. Trace every player-visible backend response field and API error path; confirm the UI renders localized stable codes/IDs rather than server-provided prose.
3. Audit all gameplay overlays, empty/loading/error states, accessibility attributes, and document metadata across each screen/state, including conditional branches.
4. Add automated source/contract tests that fail on the identified Quick Battle literals and on unlocalized display fallbacks.
5. Record explicit disposition for the invariant `1vs1` / `1vsAI` notation.

L0 remains **in progress**. No translation production or locale activation is authorized until all remaining gates above are evidenced by tests.

## L0 gameplay-display and local-question delivery trace — 2026-11-21

### Additional confirmed gaps

| Finding | Source | Impact | Required action |
|---|---|---|---|
| `createQuestionPackages(category, matchId, language)` ignores its `language` argument and always calls `getQuestionCopy('fa', question)` | `app/src/game/localMatchAdapter.js` | Local match packages are built with only hard-coded `en` and `fa` entries; selected locale is not used to select question content | Make the selected locale an explicit input to question-pack resolution; preserve canonical English data and stable option IDs/answer key |
| Local question delivery constructs only `localized.en` and `localized.fa` | `localMatchAdapter.js` | No path exists yet for the other 18 locale question packs | Add locale-pack registry/resolver with strict missing-pack behavior; do not silently present English as a completed translation |
| Local scripted opponent/player display names are literal English | `localMatchAdapter.js` `createView()` | Participant names can appear in the competitive match UI | Resolve these labels from locale copy or stable participant display-name descriptors |
| Quick Battle preview `categoryTitle` and `mode` flow into the challenge model | `App.jsx` → `session.js` | Hard-coded preview metadata can surface in game/results UI | Resolve localized display title and mode label before creating/rendering the challenge |
| `getCategoryTitle(language, categoryId, fallback)` returns caller-provided fallback when no localized category key exists | `app/src/i18n.js` | A raw English fallback or internal ID can escape into UI if caller passes one | Audit every call site; use localized fallback keys and add tests for unknown/missing category IDs |
| `getQuestionCopy(language, question)` falls back to the canonical question object when no pack entry exists | `app/src/i18n.js` | Missing translation can silently display English canonical content | Keep fallback only where explicitly allowed for canonical English; for non-English selected locales, require an explicit missing-translation state or reject the pack |

### Local match content contract to preserve

- The English fixture remains the canonical source.
- Question IDs, round order, option IDs/order/count, answer key, scoring, timer, and match semantics must remain invariant across locale packs.
- Translation must change only player-facing prompt/option text and other explicitly localized display fields.
- The locale used to build a match must be the same locale used to resolve its question package; no hard-coded `fa` selection is acceptable.
- A locale without a complete approved question pack must remain unavailable for selection/match delivery.

### Additional L0 exit gates

6. Test that local match question packages use the requested locale rather than always Persian.
7. Test that every active locale has a complete question pack with exact fixture-ID, option-count, option-ID, order, and answer-key parity.
8. Test that missing non-English translations fail closed and never silently fall back to English.
9. Test participant display names, category title, mode title, and result metadata in both RTL and LTR locales.


## Stage 2 implementation evidence — 2026-11-21

- `app/src/game/questionTranslations.js`: 18 offline locale packs for all 24 fixture IDs; test coverage preserves prompt presence, option count/order, and canonical answer index.
- `app/src/game/categoryTranslations.js`: Spanish and French category names, subtitles, and all 115 subcategory labels; exact key coverage is tested against the canonical catalog.
- `app/src/game/localMatchAdapter.js`: localized question packages are now assembled from `getSupportedLocales()` instead of a Persian-only hard-coded branch. Newly completed locales will be included automatically once enabled.
- `app/src/i18n.test.js`: recursive English/Persian key and placeholder parity guard added.
- Stage 2 remains open: full UI dictionaries and category packs for the other 16 locales, runtime integration, full all-locale tests, and locale activation are not yet complete.
