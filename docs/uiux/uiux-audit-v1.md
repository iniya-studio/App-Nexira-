# NEXIRA UI/UX Repository Audit — V1

**Status:** Audit completed; no application code changed.  
**Audited branch:** `feature/nexira-uiux-home-prototype`  
**Audit baseline commit:** `6cf5e150781221eccbfb84bb5ceb688b4e92f6a5`  
**Primary design authority:** `docs/uiux/nexira-design-system-v1.md`  
**Evidence:** Repository tree and source files inspected, including `src/App.jsx`, `src/game/*`, `src/i18n.js`, navigation, stylesheets, package configuration, README and Android workflow. The supplied screen montage was used as visual context only.

## 1. Executive summary

The current application is a functioning **local 2D prototype**, not yet the complete online AI competitive game. It already contains useful foundations that should be preserved: a React/Vite/Capacitor shell, splash and language preference, eight category definitions, solo challenge flow, local profile progression, gameplay and solo results, a local pass-and-play 1v1 preview, a scripted 1vAI preview, Persian/English copy, RTL/LTR direction handling, Android back handling, and automated tests.

The main UI/UX issue is not that every screen must be discarded. It is that the current navigation and information architecture reflect an earlier prototype rather than the approved product:
- Home has one generic **Start a Challenge** action instead of direct 1v1 / 1vAI entry.
- Category selection leads to a mixed challenge/mode page containing solo practice and local competitive previews.
- Ranking is explicitly local personal-best data, not a global leaderboard.
- Profile is a local device profile with editable display name; there is no account/guest identity flow.
- Settings is a separate bottom-nav destination and contains only language/reduced-motion controls.
- Store is absent.
- Matchmaking, match-found, online match, AI service status and social/friends screens are absent.

**Recommendation:** retain the working game engine and core screen building blocks; restructure navigation and screen composition around the approved UX, then progressively replace incomplete surfaces. Do not rewrite the app wholesale.

## 2. Implementation baseline

| Area | Verified implementation |
|---|---|
| App runtime | React 19 + Vite |
| Android | Capacitor 7 |
| Icons | `lucide-react` |
| Fonts | Local Fontsource Variable packages for Inter and Orbitron |
| Localization | `src/i18n.js`, English and Persian copy; document direction toggles RTL for Persian |
| Main screen orchestration | One large `src/App.jsx` component with screen state and inline screen JSX |
| Navigation | Local `screen` state plus `src/navigation.js` hardware-back helper; no route library |
| Game data | Eight hard-coded categories, three sample questions per category |
| Solo progress | `localStorage` key `nexira.profile.v1` |
| Solo scoring | Client-side `src/game/scoring.js` and `src/game/session.js` |
| Competitive preview | `src/game/localMatchAdapter.js`; same-device pass-and-play 1v1 and scripted 1vAI |
| Persistence | Local device storage only; competitive preview result is not saved to profile |
| Styling | Four CSS layers imported in order: `styles.css`, `theme.css`, `app.css`, `nexira-premium.css` |
| Tests | Node test runner; game, scoring, session, local-match, navigation and localization tests are present |
| Android CI | Workflow installs dependencies, runs tests, builds APK with Java 21 and uploads debug artifact |

### Important technical observations

1. `src/App.jsx` is a monolithic screen controller. Shared visual primitives exist (`ScreenFrame`, `ScreenHeading`, `GlassPanel`, `StatCard`, `ProgressBar`), but many screen-specific elements remain inline. Extract reusable components gradually; avoid a risky all-at-once rewrite.
2. CSS ownership is fragmented across four sequential stylesheets. `theme.css` still contains a large legacy neon/glass visual layer, while `nexira-premium.css` overrides portions of it. This creates cascade complexity and makes future visual changes harder to reason about. Consolidate deliberately after mapping selector usage; do not delete a stylesheet blindly.
3. `styles.css` is effectively a single-line stylesheet, which makes review and maintenance difficult. Formatting/organization can be improved in a dedicated cleanup pass.
4. The font packages are dependencies and imported locally, which is a stronger offline baseline than relying only on remote font loading. Persian glyph rendering still requires actual-device verification.
5. The current UI's local/preview labels are valuable honesty safeguards. Preserve clear environment labels until real backend services are connected.
6. The current README explicitly describes the prototype as local-only with no online account, matchmaking, backend or multiplayer. UI must not imply those capabilities are already live.

## 3. Screen-by-screen audit

Classification meanings:
- **Keep:** useful foundation; retain its core role.
- **Refine:** preserve the screen/feature but materially improve its hierarchy or content.
- **Replace:** current screen structure conflicts with the approved product UX.
- **Create:** no implementation exists in the audited branch.
- **Out of V1 scope / later phase:** reserve a place in the product map, but do not imply it is part of the current release scope.

| Screen / feature | Current code evidence | Classification | Audit decision |
|---|---|---|---|
| Splash | `screen === 'splash'`; branded animated transition to Home | **Keep + Refine** | Preserve brand and short transition; validate reduced motion and avoid delaying entry unnecessarily |
| Language selection | `screen === 'language'`; English/Persian; currently reached from Settings | **Refine** | Preserve first-use selection and persistence; ensure the approved first-launch flow remains Splash → Language (first launch only) → Home |
| Home | `screen === 'home'`; operator/level, reactor, generic Start a Challenge, local metrics and shortcuts | **Replace composition / Keep data blocks** | Remove generic Start a Challenge CTA; add direct 1v1 and 1vAI entry choices; retain player progress and useful verified stats; remove or demote redundant shortcuts |
| Category selection | `screen === 'categories'`; eight selectable category tiles and local stats | **Refine** | Retain categories and category data; improve tile readability, selection feedback and layout; flow follows selected match mode |
| Challenge/mode selection | `screen === 'modes'`; solo formats/timing choices plus local 1v1 and scripted 1vAI rows | **Replace information architecture / Reuse choices** | Separate solo-practice formats from competitive match entry. The approved primary competitive path is Home → 1v1 or 1vAI → Category → Difficulty Bottom Sheet → Match. Audit the semantics of current labels before mapping them to difficulty; they currently represent challenge formats/time variants, not a clearly defined difficulty model |
| Solo gameplay | `screen === 'game'`; timer, solo player HUD, question, answers and feedback | **Keep + Refine** | Preserve tested challenge/session/scoring behavior; refine visual hierarchy, answer feedback, accessible timer and compact-screen layout |
| Local competitive gameplay | `screen === 'match-game'`; local participant cards, timer, questions, handoff/round summary | **Keep as preview / Refine** | Preserve preview as explicitly local-only. Do not present pass-and-play as online multiplayer. Real 1v1 requires backend-authoritative shared questions, timing, answers and results |
| Solo result | `screen === 'results'`; score, stats, XP, review, replay; local progress persisted | **Keep + Refine** | Preserve local result and review foundations; later connect only to authoritative services where appropriate |
| Competitive result | `screen === 'match-results'`; winner/score preview; not saved to profile | **Refine / Backend dependent** | Improve result composition; do not imply persistence, real AI or online play until implemented |
| Profile | `screen === 'profile'`; local display name, progress, honors and stats tabs | **Refine + Extend** | Preserve useful progress/honors/stats. Add explicit Guest state, Create Account and Log In entry points inside Profile. No auth implementation exists in this branch |
| Ranking | `screen === 'rankings'`; ranks the current user's category personal-best records and repeats the same player identity; explicitly says no remote players/scores | **Replace** | This is not a player leaderboard. Build the designed empty state now and connect real Global/Seasonal/Friends data only when backend contracts exist. Never fabricate player rows or rank values |
| Settings | `screen === 'settings'`; language and reduced motion only; currently bottom-nav item | **Refine + Reposition** | Remove as a bottom-nav destination; expose from Profile and optional Home gear. Organize future settings by category; only show controls that actually work |
| Store | No screen, route state, nav item or storefront component | **Create** | Required V1 destination and full UI; real payments are a separate later integration. Cosmetic-only value proposition and fairness rules apply |
| Matchmaking / waiting | No implementation found | **Create when online matchmaking is integrated** | Define searching, cancel, timeout, retry, connection-loss and queue states; do not fake live matchmaking |
| Match found / countdown | No implementation found | **Create when online matchmaking is integrated** | Confirm opponent and shared start conditions truthfully |
| Friends / social | No implementation found | **Later phase unless V1 scope is explicitly expanded** | Reserve design space; do not add nonfunctional navigation |
| Registration / Login | No auth UI or auth service found in audited frontend | **Create inside Profile; backend dependent** | Guest-first access; Email/Password and Google in V1; Apple later for iOS. Secure guest-progress transfer must be backend-authoritative |

## 4. Shared component audit

### Existing reusable primitives

| Existing component / pattern | Current use | Decision |
|---|---|---|
| `ScreenFrame` | Main screen container | Keep; standardize safe-area/content behavior |
| `ScreenHeading` | Eyebrow/title/description | Keep; improve responsive and RTL typography |
| `GlassPanel` | General feature/info panel | Refine naming/material semantics; reduce legacy glass-specific coupling |
| `StatCard` | Compact metric display | Keep; define semantic variants and minimum readable dimensions |
| `ProgressBar` | Level/XP progress | Keep; ensure accessible label/value and consistent display |
| `category-tile` | Category selection | Refine as a shared Selection Card |
| `mode-option` | Challenge/mode list row | Refine; do not overload for unrelated product choices |
| `answer-button` | Question answer option | Keep; formalize default/selected/correct/incorrect/disabled states |
| `leader-row`, `podium-card` | Current local personal-best presentation | Reuse only as visual starting points; data semantics must be redesigned |
| `screen-tabs` | Profile/results tabs | Keep; formalize shared tab behavior and selected states |
| `setting-row`, `toggle-control` | Settings controls | Keep; add accessible labels and states |
| `bottom-nav` / `nav-item` | Current four-item nav | Replace destinations with Home, Ranking, Store, Profile |

### Component families to standardize before screen-by-screen implementation

1. Buttons: primary, secondary, tertiary, destructive, icon-only.
2. Cards: information, selection, statistics, ranking, reward/achievement, store item.
3. Rows: player/ranking, settings, selectable list, friend (later phase).
4. Match primitives: player identity, opponent, timer, question, answer, score, match status and result.
5. Overlays: Bottom Sheet, confirmation dialog, transient feedback.
6. System states: loading, empty, offline, error, success, disabled, selected.
7. Navigation: top bar, back action, bottom navigation, tabs.

Use Lucide React as the single existing icon family unless a demonstrated limitation justifies a change. Establish consistent stroke weight, size, alignment and touch target. Avoid decorative icons without meaning.

## 5. Navigation and flow gaps

### Current implemented navigation

- Splash → Home automatically.
- Home → Categories → Modes → Solo Game → Solo Result.
- Home → Categories → Modes → Local Match Preview → Local Match Result.
- Home → Profile / Local Rankings / Settings.
- Settings → Language selection.
- Bottom nav currently exposes Home / Rankings / Profile / Settings.

### Approved target navigation

- Fixed bottom nav: **Home / Ranking / Store / Profile**.
- Settings from Profile and optional Home gear.
- First launch: Splash → Language Selection → Home.
- Returning launch: Splash → Home.
- Guest play remains available without account creation.
- Account creation and login live inside Profile.
- Competitive entry: Home → 1v1 or 1vAI → Category → Difficulty Bottom Sheet → Match.
- Solo practice remains a distinct experience; it must not be confused with the core competitive modes.

### Flow questions to resolve during UX specification (not by guessing in code)

- Confirm whether solo practice remains visible from Home or becomes a secondary destination.
- Define what the difficulty options mean for each category and match mode. Current `MODE_TIMES` values are 7, 9 and 10 seconds; current labels are Elite/Tactical/Focused and do not establish a coherent difficulty contract.
- Define the exact 1v1 and 1vAI setup differences, including when difficulty is selected.
- Confirm guest ranking visibility/eligibility against the approved product and backend rules before rendering ranking claims.

## 6. Data truth and backend dependencies

The audited UI must preserve clear boundaries between local prototype behavior and future online functionality.

| Capability | Current truth | UI requirement |
|---|---|---|
| Player identity | Local default name stored in browser/WebView localStorage | Label as local/guest preview until identity service exists |
| Profile progress | Local device storage | Do not imply cloud backup or cross-device sync |
| Solo challenge | Local questions, timer and scoring | May be presented as local practice |
| 1v1 | Two human participants taking turns on one device | Label as local pass-and-play preview; not online multiplayer |
| 1vAI | Scripted opponent with deterministic behavior | Label as scripted preview; not real AI |
| AI question generation | Not connected in this frontend branch | Do not show a live AI generation claim |
| AI judging | Local exact-option comparison in preview | Do not show real AI judging claim |
| Global/seasonal leaderboard | No online ranking data/service in this branch | Use designed empty/unavailable state until backend integration |
| Matchmaking | No online service in this branch | No live queue or opponent-found claim |
| Store | No Store UI or payment service in this branch | Storefront UI may be built; transaction success must not be simulated as real |
| Guest-to-account transfer | No auth UI/service in this branch | Design entry flow; actual transfer requires secure backend contract |

## 7. CSS and visual maintenance findings

- The approved palette and Premium Competitive Gaming direction are documented in `nexira-design-system-v1.md`.
- `nexira-premium.css` is a Home-focused override layer. It should not become the long-term place for all future screen styles.
- `theme.css` contains a substantial legacy visual system and many overlapping selectors. Before removing it, map which selectors remain used by non-Home screens.
- Build tokens and component styles in a maintainable, intentional order. Prefer clear component ownership over increasingly specific override selectors.
- Avoid changing all existing class names during the first design-system pass; preserve behavior and reduce regression risk.
- Review actual Android rendering for Persian/Arabic glyphs, number direction, text wrapping, safe areas and narrow widths.

## 8. Prioritized implementation plan

### Phase A — Foundation (before broad screen redesign)
1. Establish CSS ownership and token/component boundaries.
2. Standardize buttons, cards, list rows, tabs, Bottom Sheet and empty/error/loading states.
3. Standardize navigation component with the approved four destinations.
4. Add shared RTL/LTR and responsive acceptance checks.
5. Preserve existing game behavior and test suite.

### Phase B — Core entry experience
1. Redesign Home with direct 1v1 and 1vAI choices.
2. Decide and expose solo practice as a distinct secondary route.
3. Refine category selection.
4. Design difficulty Bottom Sheet; resolve time/difficulty semantics before wiring.
5. Preserve existing solo and local-preview routes until the replacement is tested.

### Phase C — Match experience
1. Refine solo gameplay and solo result.
2. Refine local match preview with explicit local-only labels.
3. Specify backend-dependent matchmaking, shared countdown, AI question generation/judging statuses and authoritative result states separately from the visual preview.

### Phase D — Identity, ranking and supporting screens
1. Rebuild Ranking as a truthful empty-state-first experience with Global/Seasonal structure ready for real data.
2. Extend Profile with Guest/Create Account/Log In states.
3. Reposition and organize Settings.
4. Design Store UI with cosmetic-only fairness rules.

### Phase E — Integration and validation
1. Build and test APK after each meaningful phase.
2. Review Persian RTL and English LTR on a real Android device.
3. Verify small-screen overflow, safe areas, tap targets, reduced motion, empty/loading/error states.
4. Run all automated tests and Android CI.
5. Ask Milad to review the APK before merging the UI branch into `integration/nexira-reconcile`.

## 9. Out of scope for this audit

- No application code, navigation, CSS, game rules, persistence or backend contracts were changed.
- No real online ranking, matchmaking, account, payment or AI integration was implemented.
- No player names, leaderboard positions, season values or sample live data were invented.
- No merge into `integration/nexira-reconcile` or `main` was performed.

## 10. Audit conclusion

The current prototype has a useful functional foundation and should be evolved, not discarded. The highest-value work is to correct the product information architecture, establish shared component standards, replace the misleading local-ranking presentation, add the missing Store destination, and design guest-first Profile/account states.

**Next action:** approve this audit as the working implementation map, then begin Phase A (shared component and navigation foundation) with a focused, reviewable pull request. The design-system document remains the primary source of truth; this audit is its repository-specific implementation companion.
