-- Persist a bounded, encrypted conversion response so a client can recover
-- after the guest identity and its original session credentials are revoked.
CREATE TABLE "GuestConversionReplay" (
    "id" UUID NOT NULL,
    "guestIdentityId" UUID NOT NULL,
    "sourceSessionId" UUID NOT NULL,
    "sourceRefreshTokenHash" VARCHAR(255) NOT NULL,
    "idempotencyKeyHash" VARCHAR(64) NOT NULL,
    "targetUserId" UUID NOT NULL,
    "responseCiphertext" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "ciphertextPurgedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuestConversionReplay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestConversionReplay_guestIdentityId_key"
  ON "GuestConversionReplay"("guestIdentityId");
CREATE UNIQUE INDEX "GuestConversionReplay_sourceSessionId_key"
  ON "GuestConversionReplay"("sourceSessionId");
CREATE UNIQUE INDEX "GuestConversionReplay_sourceRefreshTokenHash_key"
  ON "GuestConversionReplay"("sourceRefreshTokenHash");
CREATE INDEX "GuestConversionReplay_expiresAt_ciphertextPurgedAt_idx"
  ON "GuestConversionReplay"("expiresAt", "ciphertextPurgedAt");
CREATE INDEX "GuestConversionReplay_targetUserId_createdAt_idx"
  ON "GuestConversionReplay"("targetUserId", "createdAt");
CREATE INDEX "GuestConversionReplay_idempotencyKeyHash_idx"
  ON "GuestConversionReplay"("idempotencyKeyHash");

ALTER TABLE "GuestConversionReplay"
  ADD CONSTRAINT "GuestConversionReplay_guestIdentityId_fkey"
  FOREIGN KEY ("guestIdentityId") REFERENCES "GuestIdentity"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestConversionReplay"
  ADD CONSTRAINT "GuestConversionReplay_sourceSessionId_fkey"
  FOREIGN KEY ("sourceSessionId") REFERENCES "UserSession"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestConversionReplay"
  ADD CONSTRAINT "GuestConversionReplay_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
