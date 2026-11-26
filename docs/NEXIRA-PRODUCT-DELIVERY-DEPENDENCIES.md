# NEXIRA Product Delivery Dependencies

Status: Active project constraint; owner-confirmed on 2026-11-27
Working branch: `main`

## 1. Armenia account and verification dependency

NEXIRA's production release path depends on opening and successfully verifying an account in Armenia. The account is required to establish the practical ability to pay for the external AI services and production server infrastructure needed by the product.

This is a real delivery dependency, not a reason to pause product development.

## 2. Product-first verification strategy

The account provider may reasonably require evidence that NEXIRA is a genuine, substantially implemented product rather than a concept, static demo, or attempt to bypass sanctions or provider restrictions.

Therefore, the primary prerequisite for the account application is a credible, reviewable NEXIRA release candidate:
- A functioning, coherent game experience with its core gameplay implemented.
- A real backend architecture and persisted gameplay lifecycle, not merely local UI fixtures.
- Clear separation between implemented capabilities and integrations that are not yet live.
- A review package that can demonstrate the product's purpose, current implementation, and release readiness honestly.

The owner may submit an installable build and supporting technical/product evidence with the account application. The project must not misrepresent unavailable production integrations as operational.

## 3. What must not be blocked

Until the account is opened and verified, continue work that does not require paid production access:
- Product and gameplay implementation.
- Backend architecture, database schema, APIs, workers, and deterministic tests.
- Client integration and local/test-environment verification.
- Security, reliability, documentation, and release-candidate preparation.
- Provider-agnostic integration contracts and test doubles.

Do not claim that live paid AI or production hosting is operational until credentials, billing, deployment, and real end-to-end verification have succeeded.

## 4. Release sequencing

1. Build NEXIRA into a credible, reviewable product rather than stopping at a demo.
2. Prepare an installable release candidate and concise evidence package.
3. Apply for the Armenia account and complete the provider's identity/product verification.
4. After successful verification, establish the required payment capability.
5. Configure and verify paid AI and production server services.
6. Run live end-to-end, operational, security, and release checks before public launch.

## 5. Ownership and change control

This dependency was explicitly stated by the product owner. Do not downgrade it to an optional future task or use it to justify stopping implementation. Any change to the account jurisdiction, verification strategy, or payment dependency requires the owner's decision.
