-- Persist guest display names so the player profile survives app restarts and conversion.
ALTER TABLE "GuestIdentity" ADD COLUMN "displayName" VARCHAR(160);
