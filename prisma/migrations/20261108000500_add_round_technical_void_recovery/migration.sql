ALTER TYPE "MatchScoreEntryType" ADD VALUE 'ROUND_VOID_REVERSAL';

ALTER TABLE "Round"
  ADD COLUMN "voidedAt" TIMESTAMPTZ(3),
  ADD COLUMN "voidReason" VARCHAR(64),
  ADD CONSTRAINT "Round_void_state_consistency_check"
    CHECK (
      ("voidedAt" IS NULL AND "voidReason" IS NULL)
      OR
      ("voidedAt" IS NOT NULL AND "voidReason" IS NOT NULL AND "completedAt" IS NOT NULL)
    );

CREATE INDEX "Round_voidedAt_completedAt_idx"
  ON "Round"("voidedAt", "completedAt");
