# NEXIRA UI/UX — Phase 01: Home Screen Prototype

## Status
Planning baseline only. No application code or existing gameplay behavior is changed by this document.

## Repository baseline
- Frontend: React 19 + Vite.
- Android wrapper: Capacitor 7.
- Styling: existing CSS design system in `src/styles.css`, `src/theme.css`, and `src/app.css`.
- Icons: `lucide-react`.
- Localization: existing Persian/English copy system with RTL/LTR direction handling.
- Current Home screen: custom NEXIRA Battle Arena composition with a CSS-built reactor, player/level summary, primary play action, metrics, and shortcuts.

## Design decision
Keep the existing NEXIRA visual identity and component architecture. Do not replace the application with a downloaded template or introduce a new CSS framework.

Use Kenney's official **UI Pack - Sci-Fi** only as an optional source of small visual assets where they improve the interface. The official asset page identifies 130 files and a Creative Commons CC0 license:
https://kenney.nl/assets/ui-pack-sci-fi

The pack is not a React component library. Its sprites must be selectively adapted; buttons, layout, responsive behavior, accessibility, localization, and state remain implemented in React/CSS.

## Visual direction
- Preserve the deep navy background and NEXIRA cyan/turquoise/blue palette.
- Keep strong contrast and readable, mostly opaque panels; avoid excessive glass transparency.
- Use restrained sci-fi framing and lighting rather than decorative clutter.
- Preserve Orbitron for display accents and Inter for body text.
- Keep touch targets comfortable on mobile.
- Support Persian RTL and English LTR without duplicated screen implementations.
- Respect reduced-motion preferences and avoid expensive mobile effects.

## Phase 01 scope
Create one reviewable Home-screen prototype before applying a design system across the app:
1. Review the existing Home screen at mobile and desktop breakpoints.
2. Define reusable tokens for surfaces, borders, elevation, spacing, radii, and focus states.
3. Refine the Home screen hierarchy: player identity/progress, primary play action, match entry, and secondary dashboard information.
4. Use Kenney assets only if a specific asset improves clarity or visual quality over the existing CSS/Lucide implementation.
5. Verify Persian and English layouts, keyboard/focus states, reduced motion, and small-screen overflow.
6. Run the existing test suite and production build before requesting an APK review.

## Non-goals
- No changes to match logic, scoring, timers, profile persistence, localization data, or navigation behavior.
- No backend, server, paid AI, analytics, ads, or payment integration.
- No wholesale UI-kit import and no new framework dependency without a demonstrated need.

## Acceptance criteria
- Existing navigation and gameplay behavior remain unchanged.
- Home screen is visually coherent with the rest of NEXIRA.
- Persian RTL and English LTR remain correct.
- No horizontal overflow on supported mobile widths.
- Text and interactive controls remain readable and accessible.
- Automated tests and production build pass.
- The user reviews the resulting APK before the design is propagated to other screens.
