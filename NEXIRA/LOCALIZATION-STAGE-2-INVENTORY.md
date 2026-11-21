# NEXIRA Localization — Stage 2 Source Inventory

Status: L0 inventory in progress  
Baseline branch: `main`  
Baseline commit inspected: `7f00118f585347e503a9bb2b7152ad0728b07440`  
Target locale order: `en, fa, ar, es, fr, de, pt, ru, tr, hi, id, ja, ko, zh-CN, bn, ur, it, nl, th, vi`

## Confirmed source surfaces

| Surface | Source of truth | Current evidence | Work required |
|---|---|---|---|
| Locale registry | `app/src/locales.js` | 20 target locales; only `en` and `fa` enabled | Keep enablement closed until release gates pass |
| UI copy | `app/src/i18n.js` → `COPY` | English and Persian dictionaries; dictionary section is about 53 KB | Translate every nested leaf for the 18 remaining locales; preserve key and placeholder parity |
| Category labels | `COPY.*.categoryNames`, `categorySubtitles`, `categorySubcategories` | 23 category IDs and 115 subcategory IDs in `app/src/game/categoryCatalog.js` | Translate every name, subtitle, and subcategory label |
| Question content | `app/src/game/questionFixtures.js` + `PERSIAN_QUESTIONS` in `app/src/i18n.js` | 24 stable question IDs; English source and Persian prompt/options | Add complete prompt/options for every locale; preserve IDs, order, option count, and answer index |
| Local match delivery | `app/src/game/localMatchAdapter.js` | Local question package currently exposes `en` and `fa` localized content only | Resolve requested locale pack instead of hard-coding Persian |
| UI integration | `app/src/App.jsx`, `app/src/components/AccountSessionPanel.jsx` | App consumes centralized copy; App source is about 93 KB | Audit all rendered text, attributes, accessibility labels, placeholders, and conditional states for hardcoded literals |
| Frontend tests | `app/src/i18n.test.js` | Existing en/fa parity, category, fixture, and locale-registry tests | Extend to all packs, placeholder integrity, visible-literal coverage, and question-pack integrity |
| Backend locale policy | `backend/src/common/localization/locale-registry.ts` | Target registry exists; enabled set is en/fa | Maintain exact frontend/backend target and enablement parity |

## Confirmed counts

- Target locales: 20
- Currently enabled locales: 2 (`en`, `fa`)
- Product categories: 23
- Subcategories: 115
- Legacy question fixtures: 24
- Question translation packs currently present: English canonical fixtures and Persian translations

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
