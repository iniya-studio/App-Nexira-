# NEXIRA Frontend–Backend Integration Contract
Version: 1.2
Status: Approved implementation baseline for the recovery monorepo
Scope: V1 app integration with the existing NestJS modular monolith
Boundary: Preserve the NestJS modular monolith and existing identity/session foundations. Narrow, tested Backend contract and lifecycle changes are allowed when required to close a verified V1 gap.

## 1. Current verified state

- The Android app is a React + Vite + Capacitor client under `app/`.
- Production 1vAI uses `app/src/game/onlineMatchAdapter.js` and the authenticated REST API. `localMatchAdapter.js` is reserved for Vite development/demo and automated deterministic tests.
- The backend is under `backend/`, uses the existing NestJS + Prisma modular monolith, and exposes `/api/v1`.
- Guest identity, email/password authentication, Google sign-in, rotating refresh sessions, authenticated match creation/read, round readiness, localized question delivery, and answer submission already exist.
- The backend CI and Android build workflows are independent. This document does not alter either backend schema or migration history.

## 2. Non-negotiable integration rules

1. The backend remains the final authority for identity, session validity, match state, round timing, accepted answers, judging, score, XP, and ranking.
2. V1 guest play remains available without forcing registration.
3. A guest identity is created on the server. Do not invent a client-only guest ID and do not trust a client-supplied principal ID.
4. Access tokens are short-lived. Refresh tokens are rotated and must be treated as secrets.
5. Persist the refresh token using the platform's secure storage capability; never store it in localStorage, sessionStorage, logs, analytics, or crash reports.
6. Every answer submission has a fresh high-entropy idempotency key. A network retry of the same logical submission must reuse the same key and exact payload.
7. The client never calculates authoritative elapsed time, deadline acceptance, correctness, score, or opponent outcome.
8. Keep the local adapter for development/demo and automated tests only. Production 1vAI must use the online adapter and must never silently fall back to local scoring after an API failure. Device-level acceptance remains a release gate.
9. Preserve the current language-selection behavior. Send the chosen language on question reads; do not couple language selection to device locale or geography.
10. Do not introduce a new state-management library or rewrite the UI merely to add networking.

## 3. API contract already present in the backend

Base URL: environment-configured API origin + `/api/v1`.

| Purpose | Method and path | Authentication |
|---|---|---|
| Start guest identity | POST `/guest/start` | None |
| Convert guest to account | POST `/guest/convert` | Guest access token |
| Register | POST `/auth/register` | None |
| Email/password login | POST `/auth/login` | None |
| Google sign-in | POST `/auth/google` | None |
| Verify email | POST `/auth/email/verify` | None |
| Resend verification | POST `/auth/email/resend` | Access token |
| Rotate session | POST `/sessions/refresh` | Refresh token in body |
| Logout | POST `/sessions/logout` | Access token |
| Create 1vAI match | POST `/matches/ai` with `{ category, language }` | Access token |
| Read match summary | GET `/matches/:matchId` | Access token |
| Read participant-authorized round settlement | GET `/matches/:matchId/rounds/:roundId/result` | Access token |
| Read participant-authorized final match result | GET `/matches/:matchId/result` | Access token |
| Mark round ready | POST `/matches/:matchId/rounds/:roundId/ready` | Access token |
| Read localized question | GET `/matches/:matchId/rounds/:roundId/question?language=en` | Access token |
| Submit answer | POST `/matches/:matchId/rounds/:roundId/answers` | Access token |
| Question-generation recovery | GET `/matches/:matchId/question-recovery` | Access token |

All route names above are verified against the current backend controllers. DTOs and service implementations are the source of truth for payload details. Do not infer a missing route from this list.

## 4. Verified implementation and remaining acceptance gates

The backend already contains substantial server-side match infrastructure: canonical question generation and persistence, a shared database-owned round clock, participant readiness, answer acceptance with idempotency, deterministic multiple-choice judging, an AI Judge worker for free-text answers, round deadline/finalization workers, and technical-void recovery. These are real backend capabilities and must be reused; they must not be reimplemented in the client.

The production 1vAI lifecycle is implemented through the existing REST contracts and the two sanitized result routes. The answer submission receipt remains non-authoritative; the client waits for server settlement before displaying correctness or score.
- 1vAI lifecycle: question generation/recovery, AI readiness, database-owned shared round clock, AI opponent answer worker, AI Judge, round settlement, next-question generation, and final match result retrieval are implemented and covered by PostgreSQL integration tests.
- Public 1v1 matchmaking/queue and pairing are not exposed; `createOneVsOne` remains an internal service method. This is the next separate implementation milestone.
- A WebSocket client event contract is not exposed. V1 online 1vAI uses REST polling and must reconcile after foreground/resume and network recovery. A cold-process restart/resume flow for an interrupted match remains to be completed and tested.
- Transient API failures during waiting-question/waiting-result do not discard the recoverable lifecycle phase; polling can continue. If answer submission is accepted but the subsequent result read fails, the client preserves `waiting-result` and does not misclassify the accepted answer as a failed submission or send it again.
- Live provider execution still requires a deployed API, PostgreSQL, HTTPS API origin in the Android build, and server-side OpenAI credentials/model configuration for Question Generator, AI Opponent, and AI Judge. CI uses deterministic test providers and does not prove production provider connectivity.
- Full device-level 10-round acceptance against a deployed API and live OpenAI is still pending.
- Match-result-to-XP/Ranking progression policy and integration remain separate open V1 work; match score and XP must remain distinct.

The production Android app now selects the online 1vAI adapter; the local adapter remains a development/demo path only. It must never silently fall back to local scoring after an online failure. 1v1 stays unavailable in production until matchmaking and pairing are implemented. No identity/session or match-engine redesign is required; only narrow gap-closing contracts and tests are permitted.

## 5. Implemented client architecture

The implemented API boundary inside `app/src/` includes:

- `api/httpClient.js`: base URL, JSON transport, timeout/abort, normalized API errors, authorization header injection.
- `api/tokenStore.js`: secure token storage abstraction. Capacitor native builds must use an OS-backed secure-storage plugin selected and validated before production use. Browser development may use an in-memory test adapter only.
- `api/sessionApi.js`: guest start, register, login, Google, refresh, logout, guest conversion.
- `api/matchApi.js`: create match, read summary, mark ready, read question, submit answer, question recovery.
- `api/sessionCoordinator.js`: single-flight refresh, refresh-token rotation, replay protection, logout on unrecoverable session invalidation.
- `game/onlineMatchAdapter.js`: implemented for production 1vAI; calls backend APIs and exposes server lifecycle states, stable answer idempotency, readiness, round settlement, and final result.
- The current app selects the online adapter in production builds and keeps the local adapter for Vite development/demo. It does not silently fall back to local scoring.

Keep UI components independent of raw HTTP details. Do not duplicate scoring or judging logic in the client.

## 6. Session lifecycle

### First guest launch
1. The user may continue as guest.
2. Call `POST /guest/start`.
3. Keep the returned access token in memory and refresh token in secure storage.
4. Associate local non-sensitive UI preferences (such as selected language) with the local profile. Do not store credentials in the profile JSON.
5. On app restart, refresh the session before authenticated calls. If refresh is invalid/revoked, offer a new guest session without deleting unrelated local preferences.

### Refresh
- Use the exact `refreshToken` and a cryptographically random `idempotencyKey` meeting the backend DTO's high-entropy format.
- Serialize refresh attempts: only one refresh may run at a time.
- If a refresh request times out after reaching the server, retry with the same idempotency key and same refresh token so the backend can replay its encrypted retry response.
- Once a refresh response is received, atomically replace the stored refresh token. Never continue using the consumed token.
- A refresh-token reuse response or revoked session requires clearing the credential set and returning to guest/sign-in entry.

### Guest conversion
- Call `POST /guest/convert` with the current guest access token and the exact DTO fields.
- Treat successful conversion as an identity transition; replace tokens from the response and preserve the existing guest profile/progression as the backend conversion service intends.
- Never create a second account locally to imitate conversion.

## 7. Match lifecycle and UI mapping

- Creating a match: backend response provides match ID/status; keep it as the stable online match identity.
- Waiting for initial question: display a waiting/recovery state, not a fake question and not a local fallback.
- Round ready: call the backend ready route only when the actual round ID is known and the player is ready.
- Question display: fetch the localized safe question using the selected app language. Preserve server-supplied question/option IDs.
- Timer: render the server's `startedAt` and `deadlineAt` as display guidance; server acceptance remains authoritative. Reconcile after foreground/resume or network recovery.
- Answer: submit the user's response text and a stable idempotency key. Disable repeated taps while the request is pending, but keep safe retry behavior.
- Receipt: do not reveal correctness or score from the answer receipt. Wait for the authoritative finalization/result contract.
- Network loss: preserve pending request identity and ask the server for state/recovery; never assume the answer was accepted or rejected from a client timeout.

## 8. API configuration and environments

- Read the API origin from build-time environment configuration; never hardcode a developer machine address.
- Separate local development, CI, staging, and production origins.
- Production builds must fail a configuration check if the API origin is missing.
- Use HTTPS outside local development.
- Health liveness and readiness are separate: a live API process does not guarantee PostgreSQL is ready.
- Do not put real credentials, signing keys, provider keys, or production URLs with secrets in the repository.

## 9. Implementation and release sequence

1. API origin configuration, HTTP transport, normalized errors, guest identity, secure token storage, refresh coordinator, and optional account actions are implemented and covered by the existing frontend/backend test suites.
2. Production 1vAI uses the online adapter and server-owned lifecycle. The local simulation remains development/demo only.
3. Remaining 1vAI release gates: deploy PostgreSQL-backed HTTPS API, configure server-only OpenAI credentials/models, test a complete 10-round match on a physical Android device, test network recovery and cold-process match recovery, and verify APK installation/signing on target devices.
4. Complete the agreed match-result-to-XP/Ranking integration without conflating match score and XP.
5. Implement public 1v1 matchmaking/queue/pairing and its shared-question lifecycle before enabling 1v1 in production.

## 10. Acceptance criteria

- Guest can enter without registering.
- Restarting the app restores a valid session via refresh without exposing refresh tokens to web storage.
- Concurrent 401 responses trigger only one refresh operation.
- Refresh retry after ambiguous network timeout uses the same idempotency key and safely handles token rotation.
- Guest conversion preserves the same player identity/progression as defined by backend behavior.
- Match creation/question readiness/recovery are server-driven; no client-generated fake online questions.
- Two participants in 1v1 (when matchmaking exists) receive the same canonical question and shared server deadline.
- Duplicate answer retries do not create duplicate accepted answers.
- Client never determines final correctness, score, XP, or ranking.
- Existing language-first-launch behavior and current UI navigation tests remain green.
- Android build, app tests, backend CI, and end-to-end integration tests pass.

## 11. Change-control boundary

This document defines the client integration plan against the existing backend. Any proposed backend change must be a narrowly scoped gap-closing contract with tests and a forward migration only when necessary. Do not replace the modular monolith, rewrite identity/session foundations, or edit already-applied migrations.


## 12. Online 1vAI integration milestone — 2026-11-13

Implemented on `main`:
- `POST /matches/ai` accepts the selected category and app language while keeping `FREE_TEXT` answers and the server-configured match length.
- `GET /matches/:matchId/rounds/:roundId/result` returns participant-safe round settlement, hiding internal participant IDs and withholding judge decisions until adjudication is complete.
- `GET /matches/:matchId/result` returns participant-authorized final scores and winner metadata without exposing participant IDs.
- The Android production UI starts a real server-owned 1vAI match, reads localized generated questions, marks readiness, displays the database-owned deadline, submits free-text answers with a stable idempotency key, waits for AI judging and round finalization, and reads the final backend result.
- The client does not calculate correctness, elapsed time, score, AI outcome, XP, or ranking. The local simulation is not used as a production fallback.

Still required before a real device match can run against live AI:
- Deploy the NestJS API and PostgreSQL to a reachable HTTPS environment and set `VITE_API_BASE_URL` for the Android build.
- Configure server-only credentials/models for question generation, AI opponent responses, and AI judging.
- Execute a full Android-device 10-round 1vAI match and verify provider behavior, reconnects, and final settlement.
- Implement public 1v1 matchmaking and pairing separately; it is not part of this 1vAI milestone.


### Reliability audit hardening — 2026-11-13

- Deadline settlement now defers rounds with terminally failed AI Judge answers to the technical-void worker. This prevents a deadline race from finalizing a technically invalid round or applying ordinary no-response settlement before recovery.
- PostgreSQL integration coverage verifies that an expired round with an exhausted AI Judge is voided and replaced rather than finalized.
- Frontend integration tests verify that transient synchronization failures preserve retryable phases and that a result-read failure after an accepted answer does not cause a duplicate submission.
- Latest verified CI: Backend 33 suites / 176 tests; Frontend 89 tests; Android debug APK build and verification successful.
- These automated tests use deterministic providers. They do not replace live OpenAI, deployed HTTPS/PostgreSQL, physical-device, or cold-process recovery acceptance.

### Security and Android transport hardening — 2026-11-13

- Round settlement responses return no participant answer state, judge decision, or score until the round is finalized. Final match results return no score, winner type, or winner metadata until both `MatchStatus.COMPLETED` and the persisted `MatchResult` exist.
- Both result routes authorize against the participant's authenticated user/guest identity and never serialize internal participant IDs or submitted answer text.
- Backend CORS is now an explicit origin allowlist. Production Android WebView must be allowed through `https://localhost`; `capacitor://localhost` and local Vite development origins are configurable. Authorization and JSON headers are allowed; credentialed cookies are not used.
- CORS, participant-safe result visibility, and winner gating are included in the Backend CI verification.


### Public 1v1 matchmaking — implementation in progress, 2026-11-14

- Production 1v1 now uses `createOnlineMatchmakingAdapter` and the authenticated queue API; it does not call the local pass-and-play adapter.
- Enqueue carries a stable idempotency key. Before creating a new entry, the client reads `GET /matchmaking/queue/me` so a waiting or already-matched entry can be recovered after an app restart.
- The waiting screen polls the authoritative queue snapshot, supports cancellation, and hands the committed match ID to `createOnlineMatchAdapter.resume()`. The existing server-owned question, readiness, deadline, answer submission, judging and result lifecycle is reused.
- A resumed human-vs-human match maps the two server participants separately and renders the correct human winner. The client does not synthesize a second player or score.
- Category identifiers are aligned with the shipped app categories (`memory`, `logic`, `mathematics`, `knowledge`, `reaction`, `focus`, `language`, `science`) and the selected language is preserved from the queue snapshot.
- The server exposes authenticated Socket.IO match-found notifications, but the current Android/web client uses REST status polling for matchmaking; socket client subscription remains a future transport optimization.
- Backend CI (36 suites / 194 tests, PostgreSQL 16 migration, build and lint) and Android CI (frontend tests, APK build and artifact verification) are green. Real two-device testing, network interruption/cold-process acceptance, XP/Ranking integration and production HTTPS deployment remain release gates. No 1v1 production release is approved by this implementation note.
