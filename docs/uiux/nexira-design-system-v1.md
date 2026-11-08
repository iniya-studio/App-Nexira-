# NEXIRA Design System — Version 1

**Status:** Direction approved for implementation; visual tokens remain provisional until validated on-device.  
**Branch:** `feature/nexira-uiux-home-prototype`  
**Scope:** Product-wide visual and interaction system for the NEXIRA mobile-first game.

## 1. Product design position

NEXIRA is a global AI-powered competitive game. Its interface must communicate three qualities at once:

1. **Competitive authority** — clear stakes, readable match state, fair play, confident hierarchy.
2. **Intelligent technology** — AI is integrated into the experience without turning the game into a chatbot or a technical dashboard.
3. **Premium craft** — precise typography, deliberate spacing, restrained motion, strong composition, and consistent details.

The design direction is **Premium Competitive Gaming** with a restrained, modern sci-fi character. This is not a neon-first design system, and it must not depend on glow, glassmorphism, particles, or decorative effects to feel premium.

## 2. Design principles

- **Clarity before spectacle:** the next useful action must be obvious.
- **Competition is the hero:** match entry, opponent context, timer, question, score, and result receive the strongest hierarchy when relevant.
- **AI is visible through useful feedback:** communicate question generation, judging, and match status with concise status language and purposeful visual markers. Do not add AI chat.
- **Premium restraint:** use depth, contrast, typography, composition, and material quality instead of excessive glow or decoration.
- **One coherent product:** Home, Match, Ranking, Store, Profile, and Settings share the same tokens and interaction patterns.
- **Mobile-first, globally ready:** support compact screens, touch, safe areas, RTL/LTR, long translations, and future languages.
- **Performance is part of design:** avoid heavy blur, constant animation, oversized assets, and unnecessary dependencies.
- **Fairness stays visible:** purchases and customization must never imply competitive advantage.

## 3. Visual direction

### Palette direction

Use a dark, sophisticated foundation with a restrained cool identity and a warm reward accent. The exact values below are starting tokens, not immutable brand law; validate them against real screens and accessibility contrast before locking.

| Token | Initial value | Purpose |
|---|---:|---|
| `--nx-bg` | `#101820` | Main app background |
| `--nx-surface` | `#18232D` | Primary surfaces |
| `--nx-surface-raised` | `#202E39` | Elevated cards and controls |
| `--nx-surface-muted` | `#263642` | Secondary panels |
| `--nx-text` | `#F2F5F6` | Primary text |
| `--nx-text-secondary` | `#B5C1C8` | Supporting text |
| `--nx-text-muted` | `#84939D` | Low-emphasis metadata |
| `--nx-brand` | `#78AEBB` | Primary brand/action accent |
| `--nx-brand-strong` | `#4E91A2` | Active and selected states |
| `--nx-success` | `#62B99A` | Correct/success states |
| `--nx-warning` | `#D6B36A` | Rewards and caution |
| `--nx-danger` | `#D97878` | Errors and wrong answers |
| `--nx-border` | `rgba(205,220,228,.14)` | Subtle structural edges |

Rules:
- Do not use bright accent colors as large-area backgrounds.
- Do not use glow as the default focus or elevation treatment.
- Reserve success, warning, and danger colors for semantic meaning.
- Keep gradients rare and functional; solid surfaces should carry most of the UI.
- Never rely on color alone to communicate state.

### Typography

- Keep **Orbitron Variable** as a distinctive display face for selected brand moments, short headings, levels, and compact game labels. Do not set long paragraphs or dense data in Orbitron.
- Use **Inter Variable** for Latin UI text and data.
- Verify Persian/Arabic glyph coverage and rendering on the actual Android build. Use a suitable bundled/localized fallback where necessary; do not assume a CSS family name means the font is installed.
- Define a consistent type scale and line heights. Prioritize readability over sci-fi styling.
- Avoid excessive letter spacing, especially in small labels and RTL layouts.

### Shape, depth, and materials

- Prefer clean geometry and consistent radii over decorative angular frames.
- Use solid or subtly layered surfaces with clear boundaries.
- Elevation comes from tonal separation, borders, and restrained shadows.
- Avoid low-contrast transparent panels over busy backgrounds.
- Keep the background art secondary to content; use a controlled overlay wherever text is placed over imagery.

## 4. Layout and navigation

- Preserve the approved four-item bottom navigation: Home, Ranking, Store, Profile. Settings remains reachable from Profile or the Home gear action.
- Respect device safe areas and keep primary actions clear of the bottom navigation.
- Use a consistent spacing scale based on 4-point increments.
- Establish predictable content widths and responsive breakpoints.
- Avoid oversized empty containers and decorative elements that consume valuable mobile space.
- Design for small Android phones first, then scale up for tablets and desktop.

## 5. Component standards

Create shared patterns for:
- Primary, secondary, tertiary, and destructive buttons.
- Navigation items and active states.
- Cards, panels, list rows, badges, chips, and tabs.
- Player identity, level/XP, ranking position, and reward indicators.
- Match status, matchmaking state, question panel, timer, answer options, score, and result.
- AI question-generation and AI-judging status.
- Loading, empty, offline, error, success, and disabled states.
- Dialogs, sheets, confirmations, and transient feedback.

Each component must define default, pressed, focused, disabled, loading, selected, and error states where applicable. Touch targets must be comfortable on mobile.

## 6. Motion and feedback

- Motion should explain hierarchy, state changes, or cause-and-effect.
- Prefer short, purposeful transitions; avoid perpetual decorative animation.
- Respect reduced-motion preferences.
- Match feedback must be immediate, legible, and not dependent on sound or color alone.
- Avoid motion that delays access to the next action.

## 7. AI experience rules

- AI Question Generator and AI Judge are core product capabilities, not decorative mascots.
- Show concise, truthful statuses such as preparing a question, evaluating an answer, or result confirmed.
- Never imply an AI decision is final before the authoritative match service confirms it.
- In 1v1, the UI must reinforce that both players receive the same question and shared timing.
- In 1vAI, distinguish the AI opponent clearly without presenting it as a chat assistant.
- Error and retry states must explain what happened without blaming the player.

## 8. Localization and accessibility

- RTL and LTR are first-class layouts, not mirrored afterthoughts.
- Use logical CSS properties (`margin-inline`, `padding-inline`, `inset-inline`) where possible.
- Test long translated strings, mixed-direction numbers, truncation, and text scaling.
- Maintain strong text contrast; target WCAG AA contrast for normal text.
- Provide visible focus states and meaningful accessible labels for icon-only controls.
- Never encode meaning only through color, icon, or animation.

## 9. Technical constraints

- Keep the existing React + Vite + Capacitor architecture.
- No new UI framework or styling framework without a demonstrated need.
- Reuse the existing icon library where suitable.
- Do not alter match logic, scoring, timers, persistence, navigation behavior, localization content, or backend contracts as part of visual-only work.
- Keep UI changes isolated on `feature/nexira-uiux-home-prototype`.
- Do not merge into `integration/nexira-reconcile` until automated checks pass and Milad approves the APK.
- Keep `main` untouched.

## 10. Delivery sequence

1. Audit current components, styles, font assets, and responsive behavior.
2. Implement foundational tokens and shared primitives without changing behavior.
3. Refine Home as the first validation screen.
4. Build and test an APK; review on a real phone in Persian and English.
5. Lock the visual direction after feedback.
6. Apply the system to Match, Ranking, Store, Profile, and Settings in controlled phases.
7. Run regression tests and visual checks after each phase.

## 11. Acceptance criteria

A phase is not complete merely because it builds. It must:
- Preserve existing product behavior.
- Render correctly on a small Android screen.
- Have no horizontal overflow or bottom-navigation collisions.
- Remain readable in Persian RTL and English LTR.
- Have coherent states and touch targets.
- Respect reduced motion and safe areas.
- Pass existing automated tests and production build.
- Be reviewed on the actual APK before integration.

## 12. Explicit non-goals

- No neon-first or glow-heavy visual identity.
- No wholesale import of a third-party UI kit.
- No AI chat interface.
- No gameplay, scoring, matchmaking, backend, payment, or data-model changes in visual-only phases.
- No claim of AAA production status based only on visual styling. Quality is measured by the complete experience, reliability, responsiveness, and polish.


## 13. Approved product-wide UX decisions

These decisions consolidate the approved direction from the UI/UX review. They are the source of truth for subsequent screen audits and implementation. Where the current prototype differs, treat the difference as work to be addressed—not as an approved product decision.

### 13.1 Global navigation

The fixed bottom navigation has exactly four destinations, in this order:
1. Home
2. Ranking
3. Store
4. Profile

Settings is accessed from Profile and may also be reached through a gear action on Home. The current prototype's separate Settings bottom-navigation item is not the target design.

### 13.2 Guest-first access and account creation

- The app must allow users to enter and play as guests without mandatory registration.
- Do not show a registration wall during first launch or before a user can play.
- Place **Create Account** and **Log In** entry points inside the Profile experience.
- A guest Profile must still feel like a real player profile: show the guest identity and the progress/statistics that are legitimately available to that guest.
- Explain the value of creating an account without coercive language or blocking ordinary play.
- V1 account methods: Email + Password and Google. Apple sign-in is deferred until the iOS release phase.
- When a guest creates or links an account, securely transfer eligible guest progress to the authenticated account. Preserve valid progress; prevent duplicate transfers, account-takeover, and unauthorized identity linking. The backend remains authoritative for identity and transfer eligibility.
- Never imply that guest progress is permanently backed up or available across devices unless the backend actually guarantees it.

### 13.3 Home and match-entry flow

- Remove the current **Start a Challenge** primary card/action from Home.
- Home presents two clear, direct match-entry choices: **1v1** and **1vAI**.
- Category/discipline selection remains part of the match-entry flow.
- Remove the separate full-screen difficulty-selection page. Present difficulty selection in a well-designed **Bottom Sheet** at the appropriate point in setup.
- Preferred high-level flow: **Home → Match Mode (1v1 / 1vAI) → Category/Discipline → Difficulty Bottom Sheet → Match**.
- If a selected discipline offers additional challenge formats or timing variants, retain those choices in the relevant setup context; do not create unnecessary extra navigation steps.
- Reuse the same setup patterns for 1v1 and 1vAI where the rules are shared, while clearly communicating mode-specific differences.
- This is a UX/navigation target. Do not silently change gameplay rules, matchmaking, scoring, timers, or backend contracts while implementing visual changes.

### 13.4 Shared card and component system

Build a coherent component family rather than designing unrelated cards page by page. The following are semantic patterns; they may share a base component but must have distinct visual hierarchy and states according to their purpose:

- **Information cards:** player identity, level, XP, account and contextual information.
- **Selection cards:** match modes, categories, disciplines, challenge formats and selectable options.
- **Stat cards:** wins, losses, accuracy, best score, completed matches and other verified metrics.
- **Ranking rows/cards:** rank, player identity, score/points, league/division and verified rank movement.
- **Reward/achievement cards:** milestones, honors, badges and earned rewards.
- **Store item cards:** cosmetic/customization item, clear ownership/availability state and price when applicable. Never suggest gameplay advantage from a purchase.
- **Status/empty-state panels:** loading, no data, offline, error, success and disabled states.

Shared standards:
- Consistent spacing, radii, borders, typography, icon family, elevation and interaction feedback.
- Clear hierarchy between primary, secondary and tertiary actions.
- Selected, pressed, focused, disabled and loading states where applicable.
- Avoid tiny dense cards, decorative empty containers and low-contrast content.
- Do not force every card into the same dimensions or layout; adapt to content and screen purpose.
- Use one coherent, restrained line-icon family with consistent stroke weight and sizing. Icons support meaning; they do not replace clear labels where labels are needed.

### 13.5 Screen inventory and approved direction

| Screen / area | Current observation | Approved direction |
|---|---|---|
| Splash | Existing branded entry screen | Preserve the basic identity; refine transition and motion only where useful |
| Home | Existing dashboard and Start a Challenge action | Rework hierarchy and direct 1v1 / 1vAI entry; remove Start a Challenge |
| Category selection | Existing category grid | Refine card size, readability, selection state and scalability |
| Challenge setup | Separate challenge/mode/timing choices | Audit each choice; simplify navigation and use a difficulty Bottom Sheet |
| Gameplay | Timer, question and answer choices exist | Improve answer feedback, opponent context, match state and accessibility without changing rules |
| Matchmaking / waiting | Not represented in supplied screen review | Design clear searching, waiting, cancel, retry and connection states |
| Match found / countdown | Not represented in supplied screen review | Design opponent confirmation and fair shared-start feedback |
| Match result | Not represented in supplied screen review | Design outcome, score breakdown, XP/progress and next action |
| Ranking | Current Local Rankings page is effectively an empty personal-best state | Full redesign; see Section 13.6 |
| Profile | Basic profile, progress and tabs exist | Complete identity, progress, statistics, history and honors; support guest and registered states |
| Settings | Currently a limited standalone screen | Keep accessible from Profile/Home; organize settings into clear groups |
| Store | Not implemented in the reviewed UI | Design and implement a complete V1 storefront UI; real payment integration is a separate later milestone |
| Friends / social | Not represented in supplied screen review | Include in the product UX inventory and phase it according to V1 scope; do not imply unavailable functionality is live |
| Login / registration | Not part of first-launch flow | Provide Email/Password and Google flows from Profile; Apple later for iOS |

### 13.6 Ranking experience

The current **Local Rankings** screen is not an acceptable final Ranking experience. It is a local personal-best/empty-state prototype, not a global leaderboard.

The redesigned Ranking area should distinguish:
- **Global Ranking:** persistent all-time/global standing, separate from seasonal results.
- **Seasonal Ranking:** competition within a defined season, with season identity and remaining time when applicable.
- **Friends Ranking:** only when friend relationships and the supporting data are available.
- **Weekly view/league:** only when the ranking rules and backend data support it.

Recommended screen hierarchy:
1. Ranking context and selected scope/season.
2. Top-three presentation when verified ranking data exists.
3. Ranked player list with rank, avatar/identity, display name, points/score, level or league where meaningful, and verified movement indicators.
4. A clearly identifiable current-user position, including when the user is outside the currently visible range.
5. Useful filters that correspond to real backend-supported ranking scopes.

Rules:
- Global and seasonal rankings are separate concepts and must not be conflated. Ending a season must not erase all-time/global standing.
- Never fabricate players, ranks, scores, movement, league status or season countdowns. Use clearly labelled demo data only in a demo environment.
- When there is no ranking data, show a designed empty state that explains why and offers a relevant next step; do not present an empty decorative card as a finished leaderboard.
- Guest eligibility and visibility must follow the approved ranking/product rules and actual backend support; do not invent eligibility behavior in the UI.
- Ranking calculations and authoritative positions come from the backend, not client-side presentation logic.

### 13.7 Store and fairness

- Store is a required V1 screen and a fixed bottom-navigation destination, but it is not yet implemented in the reviewed UI.
- V1 must have a complete storefront experience even if real payment processing is deferred.
- Purchases may offer optional cosmetic expression or personalization only.
- No purchase may provide scoring, timing, matchmaking, ranking, question, or other competitive advantage.
- Non-paying users must retain a complete, respectful and enjoyable core game experience.
- Clearly distinguish owned, available, locked and not-yet-available items; do not present mock payment success as a real transaction.

## 14. UI/UX audit and implementation workflow

Before further broad UI implementation, perform a repository-backed audit on `feature/nexira-uiux-home-prototype`. The supplied nine-screen montage is a visual reference, not proof of the underlying implementation or behavior.

Audit deliverables:
1. Inventory every implemented route/screen, shared component, navigation entry and relevant CSS/module.
2. Compare the actual implementation against the screen inventory in Section 13.5.
3. For each screen/component, classify **Keep**, **Refine**, **Replace**, **Create**, or **Out of V1 scope**.
4. Identify duplicated components/styles and opportunities for shared primitives.
5. Record missing states: loading, empty, error, offline, disabled, selected and success as applicable.
6. Check RTL/LTR, small-screen layout, safe areas, touch targets, accessibility and reduced motion.
7. Separate visual-only work from behavior, data, backend and product-scope dependencies.
8. Produce one sequenced implementation plan with dependencies and acceptance criteria before making broad screen changes.

Implementation order after the audit:
1. Shared design system and reusable components.
2. Home and match-entry/setup flow.
3. Gameplay, matchmaking and match-result experiences.
4. Ranking redesign.
5. Profile and guest/account states.
6. Settings.
7. Store.
8. Remaining V1 screens and regression review.

Do not treat this sequence as permission to implement backend-dependent behavior with mock data in production. Each phase must identify what is real, what is a preview, and what depends on backend work.

## 15. Decision control

- This document is the product-wide UI/UX source of truth for the decisions recorded above.
- Preserve approved palette roles and the Premium Competitive Gaming direction. Minor accessibility or usability adjustments may be made with evidence; do not casually reintroduce the retired neon-first direction.
- If a later user decision changes a rule, update this document before implementing the affected screens.
- Keep the audit and implementation on `feature/nexira-uiux-home-prototype`; do not merge into `integration/nexira-reconcile` until checks pass and Milad approves the APK.
