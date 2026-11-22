# NEXIRA — 20-Locale Localization Implementation Contract

Status: 20-locale technical enablement and Android device smoke accepted; full linguistic/content QA remains a separate release-quality activity  
Target branch: `main` only  
Target locales (fixed order): `en, fa, ar, es, fr, de, pt, ru, tr, hi, id, ja, ko, zh-CN, bn, ur, it, nl, th, vi`

## 1. Objective

Deliver complete, production-quality localization for all 20 target locales. A locale is not complete merely because it exists in a registry or can be selected. Every user-visible string, gameplay question and answer option, locale-sensitive format, and direction-dependent UI behavior must be correct before release enablement.

Historical note: English and Persian were the initial enabled baseline. The current main source enables all 20 target locales in both frontend and backend registries. This does not by itself certify professional linguistic review of every string.

## 2. Source-of-truth architecture

- Keep a single canonical locale registry for locale code, native name, English name, BCP-47/Intl locale tag, text direction, and release enablement.
- Keep translation dictionaries structurally identical across all locales. Translation values must be non-empty and authored for their locale; copying English into a missing locale is not a valid completion strategy.
- Centralize UI copy by stable semantic keys. Components must not branch on individual locale codes to render text.
- Keep gameplay content separate from UI copy, with stable category/question identifiers. Each locale must provide prompt and every option for every shipped question.
- Keep API error codes machine-readable and localize them on the client. Never translate or render raw server/provider exception messages.
- Keep server/client locale registries and enablement policy in parity.

## 3. Fixed localization scope

### 3.1 User-visible UI
All screens and states: splash and first-run language selection; home; category and mode selection; solo and competitive matchmaking; gameplay; answer submission and synchronization states; round and final results; ranking; store and cosmetic preview; profile; account registration/sign-in/recovery/session management; settings; navigation; dialogs; confirmations; empty, loading, success, warning and error states; form labels, validation, placeholders, accessibility names, tooltips, and metadata visible in the product.

Developer-only diagnostics may remain untranslated only when proven absent from production UI.

### 3.2 Game content
Every shipped category, mode name, question prompt, answer option, difficulty label, and player-facing explanation. Translation must preserve:
- stable question/category IDs and question counts;
- exact number and order of options;
- the correct answer index and scoring semantics;
- timing, difficulty, and match rules;
- symbols, mathematical meaning, units, and factual intent.

### 3.3 Locale behavior
- Correct BCP-47/Intl locale identifiers, plural rules, interpolation, number/date formatting, and digit policy.
- RTL for Persian, Arabic, and Urdu across the application shell and nested controls; correct alignment, reading order, input behavior, punctuation/bidi isolation, and directional icon treatment.
- Verified glyph coverage and sensible font fallback for Latin, Cyrillic, Arabic, Devanagari, Bengali, Japanese, Korean, Simplified Chinese, and Thai scripts.
- No clipping, overlap, truncation, broken glyphs, or unusable controls at supported mobile viewport sizes.

## 4. Mandatory automated gates

1. **Registry parity:** exactly the 20 target locales, unique codes, valid Intl tags, correct directions, and identical frontend/backend target sets.
2. **Dictionary parity:** recursive key parity against the canonical schema; no missing, extra, duplicate, null, whitespace-only, or non-string leaf values.
3. **Translation integrity:** interpolation placeholder parity; valid plural/select branches; no accidental source-language fallback or copied English placeholders in non-English packs.
4. **UI coverage:** statically audit all translation references and production-visible literals in application components, attributes, and accessibility labels.
5. **Question integrity:** every locale has every question and option; stable IDs/counts/order/answer indexes are identical to the canonical content.
6. **Error safety:** every known API error code maps to localized safe copy; unknown codes never expose raw messages.
7. **RTL and formatting:** automated tests for direction metadata, locale number/date formatting, and bidi-safe mixed-script values.
8. **Build and regression:** frontend unit tests, Match Engine tests, backend unit/integration tests, lint, production builds, and localization audit all pass.
9. **Android release QA:** build APK from the accepted commit; inspect all 20 locales on Android, including RTL and complex scripts, and verify no layout/glyph regressions.
10. **Enablement:** a locale is enabled only when its UI, gameplay content, formatting, RTL/LTR, font, and Android QA evidence all pass. Release acceptance requires all 20 locales enabled and verified.

## 5. Execution sequence

- **L0 — Baseline inventory:** freeze the current `main` SHA; inventory UI keys, visible literals, game content, locale-dependent branches, assets/fonts, and backend locale use.
- **L1 — Contract and audit tooling:** implement reusable recursive parity, placeholder, UI-reference, content-integrity, registry-parity, and fallback-leakage checks.
- **L2 — Localization architecture:** normalize locale pack loading and lookup, locale-aware question retrieval, formatting, direction propagation, and font fallback without changing game semantics.
- **L3 — Translation production:** complete and review all 20 UI dictionaries and all gameplay content; do not enable partial packs.
- **L4 — UI/RTL/font remediation:** remove hardcoded locale branches and validate all screens, states, accessibility labels, and complex-script rendering.
- **L5 — Full verification:** run all automated gates, build Android APK, perform device/screenshot QA, and record evidence.
- **L6 — Release acceptance:** enable all 20 locales in frontend/backend together, verify persisted selection and guest/account flows, update roadmap evidence, and close the work only when every gate passes.

## 6. Change-control rules

- Work on `main` only. Do not create a branch.
- Before each write, verify the current `main` head and use the latest file blob SHA.
- Do not overwrite unrelated changes or rewrite history.
- Do not change scoring, correct answers, question order, timers, matchmaking, account/security behavior, or backend authority as part of localization.
- Preserve already-passing security/error-handling work; localization must consume safe error codes, not reopen that implementation.
- A green CI run is necessary but not sufficient. Completion requires source audit, content integrity, Android QA, and recorded evidence.
- Never mark a gate complete without a reproducible test, build artifact, or review record.

## 7. Definition of done

Localization is complete only when all 20 locales are selectable, persist correctly, render every production UI state and every shipped game question/options in the selected language, preserve game semantics, correctly format locale-sensitive values, render RTL/LTR and all required scripts on Android without visual defects, pass all automated gates, and have matching frontend/backend enablement. Until then, the affected locale remains disabled and the localization work remains open.


## 2026-11-22 acceptance reconciliation

### Accepted scope
- All 20 target locales are enabled in `app/src/locales.js` and the backend `ENABLED_LOCALES` registry.
- The frontend has locale-specific font importers/families for Arabic, Urdu Nastaliq, Devanagari, Bengali, Japanese, Korean, Simplified Chinese, Thai, and the relevant Latin/Cyrillic locales.
- Offline question translations are present for the 18 non-English/non-Persian locales; English and Persian use their canonical question sources. Category translation packs cover the 18 additional locales, with English/Persian copy in the base dictionaries.
- The frontend i18n tests assert the target/enabled locale set and category/question translation integrity. Android CI run [45053863414](https://github.com/iniya-studio/App-Nexira-/actions/runs/45053863414) passed frontend/Match Engine tests, web/Android build, APK validation, and artifact upload on commit `a414957492f84d7cdfa5959c5e4f523bc58d9994`.
- Backend CI run [45053997097](https://github.com/iniya-studio/App-Nexira-/actions/runs/45053997097) passed on commit `a339d8b5f68bd5d60fb913aaadd0e911da296ac9`.
- The product owner installed the resulting APK, confirmed that the languages were active and working, and confirmed that the selected language persisted after closing and reopening the app.

### Scope boundary
This closes the **technical foundation, enablement, persistence, and owner device smoke check**. It does not claim professional native-speaker review of every translation, exhaustive screenshot QA of every screen/locale combination, or live AI-provider language acceptance. Those remain content-quality/release QA items and must not reopen the completed technical foundation without a reproducible defect.
