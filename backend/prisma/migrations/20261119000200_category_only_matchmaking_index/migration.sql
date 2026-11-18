-- Locale is participant presentation metadata, not part of matchmaking compatibility.
DROP INDEX IF EXISTS "MatchmakingEntry_compatibility_fifo_idx";
CREATE INDEX "MatchmakingEntry_compatibility_fifo_idx"
  ON "MatchmakingEntry" ("status", "category", "queuedAt");
