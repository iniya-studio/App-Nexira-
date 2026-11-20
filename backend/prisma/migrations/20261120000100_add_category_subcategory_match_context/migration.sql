ALTER TABLE "MatchmakingEntry"
  ADD COLUMN "subcategoryId" VARCHAR(64);

ALTER TABLE "Match"
  ADD COLUMN "category" VARCHAR(64) NOT NULL DEFAULT 'general',
  ADD COLUMN "subcategoryId" VARCHAR(64);

DROP INDEX IF EXISTS "MatchmakingEntry_compatibility_fifo_idx";
CREATE INDEX "MatchmakingEntry_compatibility_fifo_idx"
  ON "MatchmakingEntry" ("status", "category", "subcategoryId", "queuedAt");
