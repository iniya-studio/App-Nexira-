# NEX-V2-001 — AI Companion Architecture

- **Status:** Approved architectural baseline for implementation
- **Scope:** V2 capability; V1 remains unchanged
- **Backend baseline:** NestJS + TypeScript modular monolith, PostgreSQL, Prisma
- **Related:** NEX-V2-002 — Character & Appearance System Architecture

## 1. Purpose

Define one persistent AI Companion per player identity. The Companion is a product-level assistant that can welcome the player, explain game features, answer permitted questions, and react to game outcomes. It is not the in-match AI opponent and it is not a separate assistant instance for every cosmetic character.

## 2. Product invariants

1. A principal has at most one Companion profile: either one registered user or one guest identity.
2. The Companion's identity, capabilities, preferences, and future conversation context are independent of its visual appearance.
3. Equipping or changing a character changes presentation only. It must not reset, fork, replace, or otherwise alter the Companion's intelligence, profile, settings, or conversation continuity.
4. The default appearance is always available and is represented by no equipped store character (activeCharacterStoreItemId = null).
5. A purchased character is a cosmetic appearance for the same Companion, never a new Companion or a separate AI agent.
6. The Companion and the match AI opponent are distinct bounded contexts, APIs, prompts, and UI roles.
7. V1 does not expose the V2 Companion experience. The V2 backend foundation must not change match, scoring, ranking, or question-judging behavior.

## 3. Responsibilities and boundaries

### Companion domain (this document)

Owns:
- One Companion profile per principal.
- Stable Companion identity and lifecycle.
- Companion preferences and capability configuration.
- Future conversational interaction orchestration through provider-neutral ports.
- Context assembly from explicitly permitted NEXIRA data.
- Welcome, help, and match-outcome response use cases.
- Safety, rate limits, auditability, privacy, and provider failure handling.

Does not own:
- Character catalog, cosmetic assets, purchases, inventory, or equipped appearance (see NEX-V2-002).
- Match state, answer judging, score calculation, XP, or ranking.
- Arbitrary account actions or payment operations initiated from natural language.

### Provider boundary

The application layer depends on a provider-neutral CompanionResponsePort (or equivalent). A provider adapter is selected through dependency injection/configuration. Provider SDKs, model names, prompts, and transport details must not leak into controllers or domain services. The AI question generator and answer judge remain separate ports and workloads.

## 4. Identity and lifecycle

- Registered identity: one profile associated with User.id.
- Guest identity: one profile associated with GuestIdentity.id, so guest play can use the same default companion foundation.
- Exactly one of userId or guestIdentityId is populated.
- Enforce uniqueness independently for each owner column and validate the XOR invariant in the service; add a database CHECK constraint in the migration where supported.
- On guest-to-user conversion, transfer or merge the guest Companion profile in the same transaction as the existing identity conversion. Preserve the Companion profile ID and preferences. Do not create a second profile. If the destination user already has a profile, apply an explicit deterministic merge policy and audit the outcome; never silently overwrite preferences.
- A deleted/revoked principal cannot continue using the Companion.

## 5. Request flow

1. Authenticate the principal using the existing session/identity guards.
2. Resolve the single Companion profile for that principal.
3. Build a bounded context object from allowlisted data (preferred language, current screen/use case, and only the minimum match outcome or help content needed).
4. Apply input validation, output limits, rate limits, and safety policy.
5. Invoke the configured provider through the provider port.
6. Validate and normalize the response before returning it.
7. Record operational metadata without storing unnecessary sensitive user text.

The Companion must not infer authorization from conversation text. Any future action that changes account, inventory, purchases, or match state requires a dedicated authenticated endpoint and explicit confirmation; natural-language output alone never performs the action.

## 6. Interaction modes

V2 may support:
- WELCOME: context-aware greeting on entry.
- HELP: answers about NEXIRA screens and supported features.
- MATCH_RESULT: supportive, non-shaming reaction to a completed win/loss/draw.
- GENERAL: bounded conversation within product policy.

These are typed use cases, not separate Companion identities. Match-result context must come from trusted server-side match results, never client-supplied winner claims. The Companion must not influence scoring or adjudication.

## 7. Appearance independence

The Companion profile stores no character-specific intelligence, system prompt, provider identity, or conversation state. The selected appearance is resolved through the Character & Appearance domain. Changing appearance must not call the AI provider, create a new profile, or mutate Companion preferences.

## 8. Reliability and operations

- Provider calls have bounded timeouts, output token/character limits, and per-principal rate limits.
- Provider failure must not block navigation, matchmaking, match completion, or result persistence.
- Welcome/help can degrade to localized static fallback copy. Match-result reactions can be omitted or use safe localized fallback copy.
- Use structured error codes; do not return provider stack traces or raw upstream errors.
- Do not log access tokens, refresh tokens, secrets, or full sensitive prompts.
- Provider configuration and secrets are environment-managed and never committed.

## 9. Privacy and data lifecycle

- Collect only the context required for the active interaction.
- Do not assume permission to create durable personal memory from conversation.
- If conversation history is introduced, define retention, deletion/export, consent, and guest-conversion behavior before enabling persistence.
- Keep operational audit metadata separate from user-facing conversation content.
- Do not use private conversations for training unless a separate explicit product/legal policy authorizes it.

## 10. API shape (V2 contract direction)

Authenticated, versioned endpoints may include:
- GET /api/v1/companion/profile — resolve profile and capabilities.
- PATCH /api/v1/companion/preferences — update allowed preferences.
- POST /api/v1/companion/interactions — submit a typed interaction.

The API must derive principal identity from the authenticated session, never from a caller-supplied user/guest ID. Exact DTOs, quotas, and interaction persistence are implementation-stage decisions and must preserve the invariants above.

## 11. Testing requirements

- One profile per user and per guest; reject ambiguous/missing principals.
- Guest conversion preserves the profile and does not duplicate it.
- Changing the equipped appearance leaves Companion profile/preferences unchanged.
- Match-result context is loaded from server-authoritative data.
- Provider timeout/failure does not affect match or core navigation flows.
- Rate limiting, input/output bounds, and provider error sanitization are covered.
- Existing auth, guest identity, match, judging, scoring, and health tests remain green.

## 12. Delivery boundary

This baseline authorizes the backend foundation for Companion identity/profile and provider boundary. Full conversational UX, durable conversation memory, voice, animation, and client-wide rendering are later V2 increments. No V1 feature is activated by this document.
