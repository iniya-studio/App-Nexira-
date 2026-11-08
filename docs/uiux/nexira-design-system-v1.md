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
