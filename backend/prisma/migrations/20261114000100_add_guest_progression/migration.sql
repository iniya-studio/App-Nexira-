-- Preserve authoritative XP progression for guest identities before account conversion.
CREATE TABLE "GuestProgress" (
    "id" UUID NOT NULL,
    "guestIdentityId" UUID NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "currentLevelXp" INTEGER NOT NULL DEFAULT 0,
    "totalXp" BIGINT NOT NULL DEFAULT 0,
    "transferredAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "GuestProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestXPTransaction" (
    "id" UUID NOT NULL,
    "guestIdentityId" UUID NOT NULL,
    "matchId" UUID,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuestXPTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestProgress_guestIdentityId_key"
  ON "GuestProgress"("guestIdentityId");
CREATE UNIQUE INDEX "GuestXPTransaction_idempotencyKey_key"
  ON "GuestXPTransaction"("idempotencyKey");
CREATE INDEX "GuestXPTransaction_guestIdentityId_createdAt_idx"
  ON "GuestXPTransaction"("guestIdentityId", "createdAt");
CREATE INDEX "GuestXPTransaction_matchId_idx"
  ON "GuestXPTransaction"("matchId");

ALTER TABLE "GuestProgress"
  ADD CONSTRAINT "GuestProgress_guestIdentityId_fkey"
  FOREIGN KEY ("guestIdentityId") REFERENCES "GuestIdentity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestXPTransaction"
  ADD CONSTRAINT "GuestXPTransaction_guestIdentityId_fkey"
  FOREIGN KEY ("guestIdentityId") REFERENCES "GuestIdentity"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestXPTransaction"
  ADD CONSTRAINT "GuestXPTransaction_matchId_fkey"
  FOREIGN KEY ("matchId") REFERENCES "Match"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Enforce the documented GLOBAL/SEASON scope invariant at the database boundary.
ALTER TABLE "RankingTransaction"
  ADD CONSTRAINT "RankingTransaction_scope_seasonId_check"
  CHECK (
    ("scope" = 'GLOBAL' AND "seasonId" IS NULL)
    OR
    ("scope" = 'SEASON' AND "seasonId" IS NOT NULL)
  );
