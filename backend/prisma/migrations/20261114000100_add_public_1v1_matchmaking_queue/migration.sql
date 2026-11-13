-- Add durable public 1v1 matchmaking queue state.
CREATE TYPE "MatchmakingEntryStatus" AS ENUM (
  'WAITING',
  'MATCHED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TABLE "MatchmakingEntry" (
  "id" UUID NOT NULL,
  "userId" UUID,
  "guestIdentityId" UUID,
  "category" VARCHAR(64) NOT NULL,
  "language" VARCHAR(16) NOT NULL,
  "status" "MatchmakingEntryStatus" NOT NULL DEFAULT 'WAITING',
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "queuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "matchedAt" TIMESTAMPTZ(3),
  "cancelledAt" TIMESTAMPTZ(3),
  "expiresAt" TIMESTAMPTZ(3),
  "matchId" UUID,
  CONSTRAINT "MatchmakingEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatchmakingEntry_idempotencyKey_key" UNIQUE ("idempotencyKey"),
  CONSTRAINT "MatchmakingEntry_exactly_one_principal_check"
    CHECK (("userId" IS NOT NULL)::integer + ("guestIdentityId" IS NOT NULL)::integer = 1),
  CONSTRAINT "MatchmakingEntry_match_state_check"
    CHECK (
      ("status" = 'MATCHED' AND "matchId" IS NOT NULL AND "matchedAt" IS NOT NULL)
      OR
      ("status" <> 'MATCHED' AND "matchId" IS NULL AND "matchedAt" IS NULL)
    ),
  CONSTRAINT "MatchmakingEntry_cancel_state_check"
    CHECK (
      ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL)
      OR
      ("status" <> 'CANCELLED' AND "cancelledAt" IS NULL)
    )
);

-- One active queue entry per stable principal, regardless of concurrent sessions.
CREATE UNIQUE INDEX "MatchmakingEntry_waiting_user_unique"
  ON "MatchmakingEntry" ("userId")
  WHERE "status" = 'WAITING' AND "userId" IS NOT NULL;

CREATE UNIQUE INDEX "MatchmakingEntry_waiting_guest_unique"
  ON "MatchmakingEntry" ("guestIdentityId")
  WHERE "status" = 'WAITING' AND "guestIdentityId" IS NOT NULL;

CREATE INDEX "MatchmakingEntry_compatibility_fifo_idx"
  ON "MatchmakingEntry" ("status", "category", "language", "queuedAt");

CREATE INDEX "MatchmakingEntry_userId_queuedAt_idx"
  ON "MatchmakingEntry" ("userId", "queuedAt");

CREATE INDEX "MatchmakingEntry_guestIdentityId_queuedAt_idx"
  ON "MatchmakingEntry" ("guestIdentityId", "queuedAt");

CREATE INDEX "MatchmakingEntry_matchId_idx"
  ON "MatchmakingEntry" ("matchId");

CREATE INDEX "MatchmakingEntry_expiry_idx"
  ON "MatchmakingEntry" ("expiresAt", "status");

ALTER TABLE "MatchmakingEntry"
  ADD CONSTRAINT "MatchmakingEntry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MatchmakingEntry_guestIdentityId_fkey"
    FOREIGN KEY ("guestIdentityId") REFERENCES "GuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MatchmakingEntry_matchId_fkey"
    FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
