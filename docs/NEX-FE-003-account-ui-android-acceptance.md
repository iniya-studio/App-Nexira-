# NEX-FE-003 — Account UI and Android Acceptance Plan

**Project:** NEXIRA  
**Document:** NEX-FE-003  
**Version:** 1.0  
**Status:** ACCEPTANCE PLAN APPROVED FOR EXECUTION — implementation/device acceptance OPEN  
**Target branch:** `main`  
**Related contracts:** NEX-BE-002 Identity & Access; NEX-FE-002 Profile & Account; NEX-BE-004 Registered Authentication; NEX-BE-005 Email Verification

---

## 1. Purpose

Close the gap between account/profile code that exists in the repository and account flows that have been accepted through repeatable automated interaction tests and a current Android APK.

This is a functional acceptance phase, not a visual redesign. Existing identity, session, security, and API contracts remain authoritative. Do not rewrite healthy backend modules or alter security semantics merely to make a UI test pass.

## 2. Verified starting point (2026-11-22 source audit)

The following source capabilities are present on `main`:

- `AccountSessionPanel.jsx`: signed-out registration and login; guest conversion and explicit guest-session replacement warning; Google sign-in; verification resend; password recovery/reset/change; session listing, individual revocation, logout-all, and logout.
- `sessionLifecycle.js` / `sessionCoordinator.js`: session initialization, restore, registration/login/conversion/Google actions, profile/account hydration, refresh lifecycle, and session controls.
- `googleAuth.js` and Android `GoogleAuthPlugin.java`: server-challenge nonce passed into Android Credential Manager; ID token returned to the frontend for backend verification.
- `App.jsx`: warm `appUrlOpen` and cold `getLaunchUrl()` handling for email-verification and password-reset links.
- Backend auth services/controllers: email/password and Google auth, email verification issue/verify/resend, password reset/change, profile/account APIs, and session controls.
- Existing automated coverage includes session lifecycle/coordinator and Google adapter tests. `app/src/components/AccountSessionPanel.test.js` also exists, but its current assertions use `react-dom/server` (`renderToStaticMarkup`) and verify static HTML only; they do not mount the component in a DOM, dispatch user events, or verify lifecycle callbacks/busy-state transitions. Therefore, genuine interaction coverage is still missing.

These are source findings, not claims of successful live OAuth, SMTP delivery, or physical-device account-flow acceptance.

## 3. Work packages and acceptance criteria

### A0 — Configuration inventory (no secrets committed)

Record whether the deployment/test environment has:
- matching Android/server Google OAuth client configuration (`VITE_GOOGLE_WEB_CLIENT_ID` and `GOOGLE_CLIENT_ID`);
- SMTP host/port/security/authentication and sender identity;
- absolute email-verification and password-reset frontend URLs;
- deployed Android App Links domain association and correct route handling.

Never commit credentials to Git. If a provider is not configured, mark its live scenario BLOCKED and continue with deterministic adapter/service tests; do not label a mocked test as live acceptance.

### A1 — AccountSessionPanel interaction coverage

Retain the existing static-render tests as markup/locale smoke tests. Add real interaction tests using `happy-dom` plus `@testing-library/react` with the existing `node:test` runner and Vite module loader. This is the selected minimal DOM harness; add both as development dependencies and regenerate `package-lock.json` with npm in the project environment. Do not hand-edit the lockfile. Keep the test DOM isolated and cleaned between cases.

Required scenarios:
1. Signed-out registration: mode selection, required fields, submit handler called once, busy state, success and safe error states.
2. Login: correct credentials forwarded; guest-to-existing-account warning remains visible and no guest progress merge is implied.
3. Guest conversion: conversion path remains distinct from sign-in and preserves the lifecycle contract.
4. Google entry: challenge precedes native identity acquisition and backend sign-in; missing configuration and cancellation show safe feedback.
5. Email verification: resend control appears only when required/unverified; delivery states are represented safely.
6. Password recovery/reset/change: correct lifecycle method and token wiring; no raw token or server exception is rendered.
7. Session controls: list, revoke selected non-current session, logout-all confirmation, and local logout.
8. Accessibility and interaction: labels are associated with inputs, submit buttons are keyboard reachable, duplicate submits are prevented, and long content remains reachable by scrolling on compact mobile viewports.

Do not mock away the behavior being asserted. Keep API/lifecycle contracts separately tested.

### A2 — Lifecycle and API regression

Extend existing tests only where a real coverage gap is found:
- cold restore hydrates account/profile state after refresh;
- transient offline restore does not create a duplicate guest or discard a potentially valid refresh token;
- profile display-name update reaches the server and refreshed state is canonical;
- verification/reset deep-link tokens are validated, consumed once, and never logged;
- session revoke/logout-all updates local state safely;
- unknown API errors remain localized and never expose raw server/provider text.

Do not duplicate existing session coordinator coverage without a reason.

### A3 — Current Android APK acceptance

Build from the exact commit whose Android CI is green. On a physical Android device, record pass/fail for:
- open Profile and scroll through the entire account panel;
- switch between sign-in and registration;
- submit registration and login forms and observe a real API response (or a clearly identified offline/configuration response);
- guest conversion versus existing-account sign-in warning;
- Google button behavior and real sign-in only when OAuth is configured;
- close/reopen app and verify session/profile restoration;
- verification and reset app links from both warm and cold app states;
- password change/recovery and session controls when backend delivery/configuration allows.

A screenshot or visible form alone is not acceptance. Record the exact APK/commit and observed outcome for every scenario. Recheck the older 2026-11-15 registration-submit/scroll report; do not assume it is still present or fixed.

### A4 — Live provider acceptance

Only after A0 is configured:
- complete a real Google sign-in on Android and verify the resulting USER identity/account state;
- receive verification and password-reset emails in a real inbox;
- open each link from cold and warm app states;
- verify tokens are single-use, expiry and invalid-token behavior are safe, and account state refreshes after success.

## 4. Definition of done

This phase is accepted only when:
- A1 component interaction tests pass in CI;
- A2 lifecycle/API regressions pass in relevant CI;
- A3 has a recorded physical-device result against a known APK/commit;
- every A0/A4 provider scenario is either live-verified or explicitly marked BLOCKED by missing deployment configuration;
- no existing identity/session/security test has been weakened or skipped.

Production release readiness additionally requires the separate global-release gates documented in NEX-BE-004, NEX-BE-005, and NEX-FE-002 (distributed abuse controls, production token lifetimes and Argon2 benchmarking, iOS secure storage, privacy export/deletion policy, and production infrastructure).

## 5. Change-control

- Work on `main`; use the latest file SHA before each write.
- Start with tests and a focused defect inventory. Fix only reproducible issues.
- Preserve the approved identity/session model, server authority, guest conversion semantics, token security, and idempotency behavior.
- Do not introduce a new account model, broad backend rewrite, or global UI redesign.
- Keep external credentials out of source control and test logs.
- Record exact commits, CI run IDs, test totals, APK artifact, and owner-observed outcomes in the roadmap.

**Current next task:** A1 — add focused AccountSessionPanel interaction coverage, then use the results to drive only the smallest necessary UI fixes.
