ALTER TYPE "MatchScoreEntryType" ADD VALUE 'ROUND_VOID_REVERSAL';

ALTER TABLE "Round"
  ADD COLUMN "voidedAt" TIMESTAMPTZ(3),
  ADD COLUMN "voidReason" VARCHAR(64);

CREATE INDEX "Round_voidedAt_completedAt_idx"
  ON "Round"("voidedAt", "completedAt");
