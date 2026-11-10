# NEX-V2-002 — Character & Appearance System Architecture

- **Status:** Approved architectural baseline for implementation
- **Scope:** V2 Companion cosmetics; V1 Store and purchase foundations remain compatible
- **Backend baseline:** NestJS + TypeScript modular monolith, PostgreSQL, Prisma
- **Related:** NEX-V2-001 — AI Companion Architecture

## 1. Purpose

Define a secure cosmetic character catalog and equip flow. A character purchased from the Store becomes the visual presentation of the player's existing AI Companion. It does not create another Companion, AI identity, memory, or capability set.

## 2. Product invariants

1. Each principal has one Companion and at most one active appearance at a time.
2. The default Companion appearance is permanently available and requires no Store item or purchase.
3. A non-default appearance must be an active, eligible cosmetic catalog item of type AVATAR and must be owned by the principal.
4. Equipping a character changes appearance only. It cannot change AI behavior, permissions, preferences, or conversation continuity.
5. Store ownership and equipped state are separate: owning several characters is allowed; only one is active.
6. The server is authoritative for catalog eligibility, ownership, refunds/revocations, and equipped state.
7. The in-match AI opponent is not a player-owned Companion character.

## 3. Reuse existing Store domain

Reuse the existing StoreItem, StoreItemType.AVATAR, Purchase, and UserInventory domain. Do not create a parallel character store, duplicate purchase records, or a second ownership ledger.

A Store AVATAR item represents a cosmetic character definition. Its existing metadata may contain a versioned, validated presentation manifest (asset references, supported expression/animation identifiers, display metadata). It must not contain executable code, prompts, provider credentials, or authority-bearing permissions.

The default appearance is a built-in fallback and is not represented as a purchasable item. A null equipped Store item means default appearance.

## 4. Companion profile relationship

The Companion profile (defined in NEX-V2-001) stores the optional active Store AVATAR reference. It does not duplicate the Store catalog or inventory. The reference must be nullable to represent the default appearance.

The equipped character must:
- reference an existing Store item;
- have itemType = AVATAR and be active/eligible;
- be owned by the authenticated registered user through a non-revoked UserInventory grant;
- remain valid after catalog display changes, subject to explicit deactivation/refund policy.

Guest principals use the default appearance. Store purchases/equipping are not available to guests unless a future commerce policy explicitly enables them.

## 5. Equip and unequip flows

### Equip

1. Authenticate the user and resolve their Companion profile.
2. Load the requested Store item from the server.
3. Confirm it is active and itemType = AVATAR.
4. Confirm a non-revoked inventory grant exists for that user and item.
5. Update the Companion profile's active appearance in a database transaction.
6. Return the canonical equipped appearance summary.

### Unequip

Set the active appearance reference to null. This restores the default appearance and never deletes ownership.

### Refund or revocation

A refund/revocation must be processed by the existing Store/Inventory workflow. If the revoked item is equipped, clear the active appearance in the same transaction (or make resolution fall back to default until reconciliation completes). Never allow a revoked item to remain render-authorized. Preserve purchase and audit history.

## 6. API shape (V2 contract direction)

- GET /api/v1/characters/catalog — list active AVATAR items suitable for display.
- GET /api/v1/characters/me — list owned appearances and current equipped appearance.
- PUT /api/v1/characters/me/equipped — equip an owned character.
- DELETE /api/v1/characters/me/equipped — restore default appearance.

All endpoints derive the principal from the existing authenticated session. Do not accept arbitrary userId or guestIdentityId in request bodies. Catalog responses expose only safe display metadata and stable asset identifiers, not internal purchase/provider data.

## 7. Presentation manifest and client boundary

The backend returns a validated, versioned presentation descriptor. The client is responsible for rendering assets and animation. The backend must not stream or execute character code.

Presentation metadata should be schema-versioned and allowlisted. Unknown fields are ignored or rejected according to the schema version. Asset delivery uses trusted asset identifiers/CDN configuration, not arbitrary user-provided URLs.

The renderer must support a default fallback when an asset is unavailable, an item is deactivated, or the client does not support a manifest version.

## 8. Guest conversion

Guest-to-user conversion must preserve the single Companion profile identity where possible. The default appearance remains selected unless the guest had an explicitly supported entitlement (not part of the current scope). The conversion transaction must not manufacture Store ownership or grant paid items. A registered user's existing inventory and equipped appearance must not be overwritten by a guest conversion.

## 9. Security and consistency

- Ownership checks occur on the server for every equip operation.
- Use transactions to avoid races between equip and inventory revocation.
- Use idempotent purchase/inventory workflows already present in Store.
- Never trust client claims that a character was purchased.
- Do not grant competitive advantages through cosmetic characters.
- Do not couple character selection to match participant identity, AI opponent configuration, ranking, XP, or scoring.

## 10. Testing requirements

- Default appearance resolves when no item is equipped.
- Only active AVATAR catalog items can be equipped.
- Unowned, refunded, revoked, inactive, or non-AVATAR items are rejected.
- Multiple owned AVATAR items can coexist; only one can be equipped.
- Unequip restores default without deleting inventory.
- Inventory revocation of an equipped item safely restores default.
- Guest users cannot equip paid appearances.
- Changing appearance does not mutate Companion preferences or identity.
- Existing Store, purchase, inventory, auth, guest, match, and scoring tests remain green.

## 11. Delivery boundary

This baseline authorizes the backend foundation for Companion profile appearance selection and secure cosmetic equip rules using the existing Store/Inventory domain. Payment-provider integration, final Store UI, 3D asset production, animation runtime, and client-wide rendering remain separate workstreams. No competitive gameplay behavior changes.
