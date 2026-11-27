# NEX-QB-005 — Android Quick Battle Integration

Status: Client integration implemented; full end-to-end acceptance requires a reachable deployed Quick Battle backend.
Target ref: `main`
Prerequisites: NEX-QB-003 gameplay contract and NEX-QB-004 scoring/result contract are implemented and CI-verified.

## 1. Scope

Connect the Android application to the dedicated Quick Battle API and render the server-owned ten-round match lifecycle. This stage does not change 1v1, 1vAI, Quick Battle backend behavior, scoring policy, XP, ranking, payments, or event settlement.

## 2. Client contract

The Android client uses only the dedicated endpoints:
- `POST /quick-battles` to create or recover the principal's active match.
- `GET /quick-battles/:matchId` and `GET /quick-battles/:matchId/current-round` to restore server state and retrieve the published public question.
- `POST /quick-battles/:matchId/rounds/:roundNumber/answers` to submit one free-text answer with an idempotency key.
- `GET /quick-battles/:matchId/result` to display the immutable finalized score.

No bundled question fixtures, local scoring, standard Match APIs, XP APIs, or 1v1/1vAI workers are used by this flow.

## 3. Runtime guarantees

- Match creation is create-or-recover, so returning to Quick Battle resumes the existing active match rather than creating a duplicate.
- The displayed question and deadline come from the backend. The client countdown is presentation only; PostgreSQL remains authoritative.
- Accepted answers are submitted with a stable idempotency key. A transport retry reuses the exact answer and key.
- After submission, the client waits for backend judging and round progression; it never locally decides correctness or points.
- A missing answer is left to the backend's explicit timeout/no-response path.
- A completed result is displayed only from the finalized backend result endpoint.
- A technically voided/cancelled match is shown as unavailable, never as a player loss or zero-score result.
- Leaving the screen does not cancel or pause the match; reopening Quick Battle invokes create-or-recover.

## 4. Verification boundary

Automated client tests cover endpoint mapping, question restoration, server-clock countdown, idempotent submission retry, final result retrieval, and technical void handling.

A green Android build verifies client compilation and APK packaging only. Full end-to-end gameplay still requires:
- a deployed backend with Quick Battle migrations and workers active;
- a valid HTTPS `VITE_API_BASE_URL` in the Android build;
- configured live question generation and AI Judge provider access.

Live paid-provider setup and production deployment remain gated by the account/payment dependency documented in `docs/NEXIRA-PRODUCT-DELIVERY-DEPENDENCIES.md`. No provider credentials or paid service setup are introduced by this stage.

## 5. Guardrails

- Work directly on `main`; no branch is authorized or required.
- Do not modify 1v1 or 1vAI runtime behavior.
- Do not reuse local fixtures or local scoring for Quick Battle.
- Do not claim live end-to-end acceptance from CI alone.
