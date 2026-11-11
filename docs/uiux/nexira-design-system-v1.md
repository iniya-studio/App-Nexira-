# NEXIRA Design System — Reference-Led V1

**Status:** Visual direction reset to the user-approved NEXIRA Home reference. Implementation has not started.  
**Branch:** `feature/nexira-uiux-home-prototype`  
**Scope:** Product-wide visual and interaction system for the NEXIRA mobile-first game.  
**Source of visual truth:** The custom NEXIRA Home reference image supplied and approved by the product owner.  
**Companion technical document:** `docs/uiux/uiux-audit-v1.md`

---

## 1. Product design position

NEXIRA is a global, AI-powered competitive game. Its interface must communicate:

1. **Competition:** clear game modes, player progress, match state, challenge and reward.
2. **Intelligent technology:** AI is part of the game experience, especially in 1vAI and AI-powered question generation/judging; NEXIRA is not an AI chat application.
3. **Premium gaming identity:** a distinctive, immersive, futuristic game environment with carefully composed graphics, polished surfaces and responsive feedback.
4. **Fairness:** purchases and customization never create competitive advantage.

The approved visual direction is **Neon Sci‑Fi / Premium Competitive Gaming**, based on the supplied NEXIRA reference—not the previously documented restrained, neutral-first direction. The reference image takes precedence over earlier generic visual proposals and over any conflicting visual description in this document's history.

The goal is faithful implementation of the approved composition and visual language, not a loose reinterpretation or a redesign based on developer preference.

## 2. Source-of-truth and decision rules

- The approved reference image is the primary authority for Home's composition, visual hierarchy, relative sizing, alignment, spacing, colors, graphic treatment and placement.
- Do not move, remove, reorder, resize disproportionately, rename or replace visible elements based on personal taste.
- Do not introduce new Home sections or omit reference sections without explicit product-owner approval.
- Where the reference does not define a detail, choose the smallest coherent implementation consistent with the established visual language. Record material assumptions; do not silently turn them into product decisions.
- If a visual requirement conflicts with a technical or accessibility constraint, preserve the intended appearance as closely as possible and report the trade-off before making a material compromise.
- The reference is a visual specification, not permission to change game rules, navigation behavior, data contracts or backend implementation.
- Do not use third-party templates or import a UI kit as a substitute for building NEXIRA's own interface.

## 3. Visual identity

### 3.1 Overall atmosphere

The interface uses a dark, immersive sci-fi environment with a luminous blue/purple technology palette and controlled high-energy accents.

Visual characteristics visible in the approved Home reference:

- Deep, dark navy/space-like foundation.
- A futuristic tunnel / dimensional environment with blue and purple illumination.
- Neon blue, cyan and violet edge lighting and highlights.
- Bright, legible white or near-white primary text.
- Gold/yellow emphasis for the major Quick Battle action and reward-oriented details.
- Layered cards and panels that remain visibly defined against the background.
- Fine luminous outlines, gradients, highlights and controlled glow.
- A purpose-designed AI robot/character visual in the 1vsAI area.
- A premium game-dashboard composition rather than a generic business dashboard.

Glow, gradients, light trails and atmospheric effects are intentional parts of this particular identity. They must be controlled and purposeful—not removed wholesale in the name of restraint, nor added indiscriminately to every pixel.

### 3.2 Color tokens

The reference image governs the final appearance. The following are semantic token roles; numerical values must be sampled/adjusted against the approved reference and validated on the actual device before being locked.

| Token | Role |
|---|---|
| `--nx-bg` | Deep navy / space background |
| `--nx-bg-overlay` | Dark overlay that preserves background art while protecting text contrast |
| `--nx-surface` | Dark card and panel base |
| `--nx-surface-raised` | Raised card, modal and interactive surface |
| `--nx-brand-blue` | Main electric-blue identity and active highlights |
| `--nx-brand-cyan` | Cyan edge light, secondary highlight and technology accent |
| `--nx-brand-violet` | Violet/purple atmospheric and selected-state accent |
| `--nx-accent-gold` | Primary Quick Battle emphasis and reward accent |
| `--nx-text-primary` | Main high-contrast text |
| `--nx-text-secondary` | Supporting labels and descriptions |
| `--nx-text-muted` | Low-priority metadata |
| `--nx-success` | Correct answer / confirmed success |
| `--nx-warning` | Caution / time pressure where appropriate |
| `--nx-danger` | Incorrect answer / error / destructive action |
| `--nx-border-glow` | Controlled luminous card and control outlines |

Rules:
- Do not replace the blue/purple identity with a neutral teal/gray palette.
- Do not invent a new accent palette that competes with the reference.
- Gold is a deliberate hierarchy signal; reserve its strongest treatment for the primary action and relevant reward moments.
- Keep text and controls readable over the background using overlays or solid-enough panel surfaces.
- Avoid making panels so transparent that content loses contrast or visual definition.
- Semantic success, warning and danger states must remain distinguishable and must not be confused with decorative brand lighting.
- Final hex values are locked only after visual comparison with the reference and device validation.

### 3.3 Background and atmosphere

- The Home background should reproduce the dark futuristic tunnel/space environment shown in the reference.
- Use the existing approved tunnel artwork where it matches; do not replace it with unrelated stock imagery.
- Preserve the reference's depth, perspective, lighting direction and overall atmosphere.
- Background detail must not compete with text, cards or controls. Use carefully tuned overlays and local contrast treatment rather than flattening the entire image.
- Particles, animated light and other atmospheric motion are permitted only where they support the reference and remain performant. They must not become visual noise.
- Avoid large-area blur or expensive continuously animated effects when a lighter CSS or asset-based treatment can achieve the same appearance.

### 3.4 Typography

- Use the existing NEXIRA typography assets where available and appropriate.
- Orbitron may be used for short display labels, game-mode titles, levels and selected brand moments.
- Use a highly readable UI font for body text, descriptions, numbers and dense information.
- Verify Persian/Arabic glyph coverage and actual Android rendering. Never assume a font family is installed merely because it is named in CSS.
- Preserve the reference's hierarchy, weight and visual emphasis while ensuring long translations remain readable.
- Avoid excessive tracking, especially in small labels and RTL layouts.

### 3.5 Shape, borders and materials

- Cards and controls should follow the reference's futuristic geometry, luminous outlines and layered dark surfaces.
- Use edge highlights, gradients, subtle inner/outer shadows and controlled glow to create depth.
- Keep each card's boundary legible; avoid excessive transparency over the busy tunnel.
- Do not force every component into an identical shape. Shared design language should coexist with the different roles of mode cards, stats, challenges and primary actions.
- Match corner radii, border thickness, bevel/angle treatment and internal padding to the reference as closely as practical.

## 4. Home screen — reference specification

Home is the first and primary visual validation target. Its structure and visual hierarchy must follow the supplied reference image.

### 4.1 Main composition

The reference includes the following visual regions, in their shown order and relative positions:

1. **Top header:** NEXIRA identity/logo area and the compact account/resource/action indicators shown in the reference (including currency/resource, notification and profile/settings affordances as applicable to the supplied composition).
2. **Match-mode area:** two prominent mode cards:
   - **1vs1**
   - **1vsAI**
3. **AI character treatment:** the dedicated robot/AI artwork belongs to the 1vsAI visual treatment. It should be implemented as a proper visual asset where possible, not approximated with emoji or an unrelated generic icon.
4. **Daily Challenge:** a distinct featured challenge card/section, retaining the reference's position, hierarchy and visual treatment.
5. **Level and statistics:** player progression and compact statistics presented in the arrangement shown in the reference.
6. **Quick Battle:** a prominent gold/yellow primary action, retaining its strong visual priority and placement from the reference.
7. **Bottom navigation:** fixed four-destination navigation:
   - Home
   - Ranking
   - Store
   - Profile

The list describes the reference's content, not permission to rearrange it. The image remains authoritative for exact alignment, proportions, spacing and relative scale.

### 4.2 Home interaction expectations

- The 1vs1 and 1vsAI cards must be clearly interactive and route into their correct existing match-entry flows.
- Quick Battle must invoke the approved quick-match behavior supported by the current product implementation. Do not invent a new matchmaking rule or bypass required setup.
- Daily Challenge must reflect real supported challenge behavior/data. If a live service is not yet available, show an explicitly designed unavailable/preview state rather than fabricated completion or reward data.
- Level, XP, currency and statistics must display actual available values. Do not hardcode fake progress as production data.
- Header controls must preserve their existing intended destinations and behavior.
- Bottom navigation must preserve the approved four destinations and existing navigation behavior.
- Pressed, selected, loading and disabled states must be visually polished and consistent with the reference.

### 4.3 Match-entry UX

- Home presents two direct match-mode choices: 1vs1 and 1vsAI.
- Category/discipline selection remains part of the match-entry flow.
- Difficulty selection belongs in a well-designed Bottom Sheet at the appropriate setup stage; do not restore a separate full-screen difficulty page unless the product owner approves a change.
- Reuse setup patterns where rules are shared, while making mode-specific differences clear.
- Preserve the existing gameplay and matchmaking behavior during visual-only work.

## 5. Interaction effects and motion

Effects are a required part of the NEXIRA visual craft, not optional decoration to be postponed indefinitely.

### 5.1 Buttons and cards

Interactive buttons and cards must have designed feedback states, including where applicable:

- Resting state with the reference-matched border, surface and lighting.
- Pressed state with a clear but brief response (for example, controlled compression, brightness/edge-light change or a short highlight).
- Selected/active state with a persistent and unambiguous visual distinction.
- Focus-visible state for accessibility and keyboard/compatible navigation.
- Disabled and loading states that remain legible and do not look accidentally broken.

Effects must communicate interaction and state. Do not make every card pulse continuously or give all controls the same intensity.

### 5.2 Motion principles

- Use short, purposeful transitions for presses, selection, navigation, feedback and state changes.
- Motion may reinforce the futuristic environment, but must not delay the next action.
- Avoid perpetual high-intensity animation, excessive particle counts and distracting flashes.
- Respect reduced-motion preferences and provide static equivalents.
- Match feedback must remain understandable without sound, color or animation alone.
- Measure performance on the target Android device; smoothness and responsiveness are acceptance criteria.

## 6. Shared component system

Build reusable components directly in the existing application architecture. At minimum, establish consistent patterns for:

- Primary, secondary, tertiary and destructive buttons.
- Header actions and resource indicators.
- Bottom navigation and active states.
- Match-mode cards (1vs1 and 1vsAI).
- AI character/illustration container.
- Daily Challenge card.
- Player level, XP and progression indicators.
- Statistic cards and compact metrics.
- Selection cards, category cards, badges and chips.
- Player identity, ranking rows and reward indicators.
- Gameplay question panel, timer, answer options, score and result.
- AI question-generation and AI-judging status.
- Loading, empty, offline, error, success and disabled states.
- Dialogs, bottom sheets, confirmations and transient feedback.

Shared components should share tokens and interaction principles, but must retain role-specific visual hierarchy. Do not turn the whole application into a collection of visually identical cards.

## 7. Product-wide navigation and UX decisions

The following product decisions remain in force. This visual-system revision does not reopen them.

### 7.1 Navigation

The fixed bottom navigation has exactly four destinations, in this order:

1. Home
2. Ranking
3. Store
4. Profile

Settings is reached from Profile and may also be reached through the Home gear action. Do not add Settings as a fifth bottom-navigation destination.

### 7.2 Guest-first access and account creation

- Users can enter and play as guests without mandatory registration.
- No registration wall on first launch or before play.
- Create Account and Log In entry points belong inside Profile.
- A guest Profile must show the guest identity and the progress/statistics legitimately available to that guest.
- Explain account benefits without coercive language or blocking ordinary play.
- V1 account methods: Email + Password and Google. Apple sign-in is deferred until the iOS release phase.
- Guest-to-account progress transfer must be secure and backend-authoritative. Prevent duplicate transfers, account takeover and unauthorized identity linking.
- Never promise cross-device backup unless the backend guarantees it.

### 7.3 Shared card and component standards

Create coherent component families for information, selection, statistics, ranking, rewards, store items and status/empty-state panels.

All components must maintain:
- Consistent spacing, typography, icon family, borders, radii, lighting and feedback.
- Clear primary, secondary and tertiary action hierarchy.
- Appropriate pressed, focused, selected, disabled and loading states.
- Comfortable mobile touch targets.
- No fabricated metrics, ranks, ownership or reward states.
- No purchase-based competitive advantage.

### 7.4 Screen inventory

| Screen / area | Approved direction |
|---|---|
| Splash | Preserve the existing branded entry identity; refine transition only where useful |
| Home | Match the supplied reference; direct 1vs1 / 1vsAI entry, Daily Challenge, level/statistics and gold Quick Battle action |
| Category selection | Refine readability, card size, selection state and scalability |
| Challenge setup | Simplify navigation; use a difficulty Bottom Sheet |
| Gameplay | Improve readability, answer feedback, opponent context and match state without changing rules |
| Matchmaking / waiting | Clear searching, waiting, cancel, retry and connection states |
| Match found / countdown | Opponent confirmation and fair shared-start feedback |
| Match result | Outcome, score breakdown, XP/progress and next action |
| Ranking | Full global/seasonal ranking experience; never present local personal best as a global leaderboard |
| Profile | Identity, progress, statistics, history and honors; support guest and registered states |
| Settings | Accessible from Profile/Home; organize settings into clear groups |
| Store | Complete V1 storefront UI; real payment integration is a separate milestone |
| Friends / social | Phase according to approved V1 scope and actual supporting functionality |
| Login / registration | Email/Password and Google from Profile; Apple later for iOS |

### 7.5 Ranking

- Distinguish Global Ranking (persistent all-time/global standing) from Seasonal Ranking.
- Friends Ranking and weekly/league views appear only when relationships, rules and backend data support them.
- Show a top-three presentation only when verified ranking data exists.
- Ranked rows may show rank, identity, display name, points/score, level/league where meaningful and verified movement.
- Identify the current user's position, including when outside the visible range.
- Never fabricate players, ranks, scores, movement, league status or season countdowns.
- Empty states must explain the absence of data and offer a useful next step.
- Ranking calculations and authoritative positions come from the backend.

### 7.6 Store and fairness

- Store is a required V1 screen and a fixed bottom-navigation destination.
- V1 requires a complete storefront UI even if payment processing is deferred.
- Purchases may offer cosmetic expression or personalization only.
- No purchase may provide scoring, timing, matchmaking, ranking, question or other competitive advantage.
- Non-paying users must retain a complete and respectful core game experience.
- Distinguish owned, available, locked and not-yet-available items. Never present mock payment success as a real transaction.

## 8. Localization, accessibility and responsive behavior

- RTL and LTR are first-class layouts, not afterthoughts.
- Use logical CSS properties where possible.
- Test Persian and English on the actual Android build, including long strings, mixed-direction numbers, truncation and text scaling.
- Keep text contrast strong against luminous and image-backed surfaces; target WCAG AA for normal text.
- Do not communicate meaning through color, icon or animation alone.
- Provide accessible names for icon-only controls and visible focus states.
- Respect safe areas and ensure the primary action does not collide with bottom navigation.
- Design for small Android screens first, then scale responsibly.
- Avoid horizontal overflow and clipped text.

## 9. Technical boundaries

- Keep the existing React + Vite + Capacitor architecture.
- No new UI framework or styling framework without a demonstrated need.
- Reuse existing assets and icon libraries when suitable.
- Build the new visual system directly in the existing source tree; do not switch to Framer, a template, or an external UI kit.
- **Backend is out of scope and must not be changed** during this UI redesign.
- Do not alter match logic, scoring, timers, matchmaking rules, persistence, localization content, API contracts, WebSocket contracts, database schema or backend services as part of visual-only work.
- Preserve working functionality. Do not remove existing code solely because it appears old; inspect dependencies and behavior first.
- Keep UI work isolated on `feature/nexira-uiux-home-prototype`.
- Do not merge into `integration/nexira-reconcile` until checks pass and the product owner approves the APK.
- Keep `main` untouched.

## 10. Delivery sequence

1. Read this design system together with `uiux-audit-v1.md`; the audit remains the technical source for existing implementation and dependencies.
2. Confirm the current branch and baseline commit before changing source.
3. Inventory existing styles, components, fonts and assets; identify reusable and conflicting layers.
4. Translate the approved reference into measurable layout regions, spacing, proportions, colors and component states.
5. Implement foundational visual tokens and shared primitives without changing behavior.
6. Rebuild Home against the reference, including the header, 1vs1/1vsAI cards, AI character treatment, Daily Challenge, level/statistics, Quick Battle and bottom navigation.
7. Compare real APK screenshots with the reference and correct visual differences iteratively.
8. Verify existing interactions and regression behavior after each controlled change.
9. Apply the approved system to the remaining screens in phases.
10. Run automated checks and review the APK on a real phone in Persian RTL and English LTR before integration.

Do not rewrite large files wholesale. Make controlled changes, preserve known-good behavior and test each meaningful step. Do not begin broad implementation until the audit and source baseline have been reviewed.

## 11. Acceptance criteria

A phase is complete only when:

- The screen follows the approved reference and this design system.
- Layout, proportions, spacing, hierarchy and placement have been visually compared—not merely judged by whether the app builds.
- Buttons and cards have polished interaction feedback.
- Existing product behavior remains intact.
- No backend files, contracts, schema or services have changed.
- The screen renders correctly on a small Android device.
- There is no horizontal overflow or bottom-navigation collision.
- Persian RTL and English LTR are readable and correctly aligned.
- Touch targets, contrast, safe areas and reduced-motion behavior are acceptable.
- Existing automated tests and production build pass.
- The actual APK has been reviewed before integration.

## 12. Explicit non-goals

- Replacing the approved reference with the retired neutral/teal design direction.
- Removing the neon, glow, tunnel atmosphere or gold primary-action treatment that defines the approved reference.
- Uncontrolled glow, excessive particles or motion that harms readability or performance.
- Importing a third-party template or UI kit as the product's design.
- Adding an AI chat interface.
- Changing gameplay, scoring, matchmaking, timers, backend, payment logic or data models during visual-only work.
- Fabricating production data to make screens look populated.
- Claiming AAA quality based on styling alone.

## 13. Decision control and document ownership

- This document is the source of truth for approved NEXIRA visual and UI decisions.
- The supplied reference image governs Home's visual composition. If a written description and the image differ, the image takes precedence unless the product owner explicitly approves a change.
- Product-wide UX decisions recorded in Section 7 remain binding unless explicitly revised by the product owner.
- The repository audit remains a separate, preserved technical companion: `docs/uiux/uiux-audit-v1.md`.
- If an approved visual or UX decision changes, update this document before implementing the affected screen.
- If repository facts change, update the audit—not this design system.
- No source, audit or backend changes are authorized merely by this document revision.

---

**Revision note:** This version supersedes the earlier neutral-first / restrained-teal visual direction. It restores the custom reference-led Neon Sci‑Fi identity and explicitly protects the approved Home composition. It does not authorize source-code implementation or backend changes.
