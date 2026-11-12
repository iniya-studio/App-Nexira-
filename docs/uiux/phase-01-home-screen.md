# NEXIRA UI/UX — Phase 01: Home Screen Prototype

## Status
Historical planning baseline for the first Home prototype. It is not the current product-wide UX specification. The approved and current source of truth is:
- `docs/uiux/nexira-design-system-v1.md`

If any statement in this historical document conflicts with the design system, the design system takes precedence.

## Repository baseline captured at the time
- Frontend: React 19 + Vite.
- Android wrapper: Capacitor 7.
- Styling: existing CSS in `src/styles.css`, `src/theme.css`, and `src/app.css`.
- Icons: `lucide-react`.
- Localization: Persian/English with RTL/LTR handling.
- The initial Home prototype contained a Battle Arena composition, player/level summary, a Start a Challenge action, metrics and shortcuts.

## Historical prototype notes
The first prototype was intentionally limited to a reviewable Home-screen visual pass. It established the initial implementation branch and demonstrated that visual refinement could be layered onto the existing React/CSS application without introducing a new UI framework.

The first prototype is not the final Home information architecture. In particular, the current approved UX removes **Start a Challenge** and presents direct **1v1** and **1vAI** entry choices on Home, as documented in the current design system.

## Current implementation guardrails
- Keep the existing React + Vite + Capacitor architecture unless the repository audit demonstrates a concrete reason to change it.
- Do not introduce a new UI framework or styling framework without an explicit technical justification.
- Preserve gameplay, scoring, timers, persistence and backend contracts during visual-only work.
- Audit the actual implementation before broad changes; screenshots alone do not establish code structure or functional behavior.
- Keep UI/UX work on `feature/nexira-uiux-home-prototype`.
- Do not merge into `integration/nexira-reconcile` until automated checks pass and Milad approves the APK.
- Keep `main` untouched.

## Asset reference
Kenney's official **UI Pack - Sci-Fi** was reviewed as an optional CC0 asset source:
https://kenney.nl/assets/ui-pack-sci-fi

No wholesale UI-kit import is approved. Reuse an asset only when it demonstrably improves clarity or quality and remains consistent with the current Premium Competitive Gaming direction.
