-- Add an auditable, idempotent ledger for competitive match score changes.
CREATE TYPE "MatchScoreEntryType" AS ENUM (
  'ANSWER_SCORE',
  'NO_RESPONSE_PENALTY',
  'FORFEIT_TRANSFER'
);

CREATE TABLE "MatchScoreEntry" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "participantId" UUID NOT NULL,
  "roundId" UUID,
  "answerId" UUID,
  "entryType" "MatchScoreEntryType" NOT NULL,
  "pointsChange" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchScoreEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatchScoreEntry_points_nonzero_check" CHECK ("pointsChange" <> 0),
  CONSTRAINT "MatchScoreEntry_idempotencyKey_key" UNIQUE ("idempotencyKey"),
  CONSTRAINT "MatchScoreEntry_answerId_key" UNIQUE ("answerId")
);

CREATE INDEX "MatchScoreEntry_matchId_createdAt_idx"
  ON "MatchScoreEntry"("matchId", "createdAt");
CREATE INDEX "MatchScoreEntry_participantId_createdAt_idx"
  ON "MatchScoreEntry"("participantId", "createdAt");
CREATE INDEX "MatchScoreEntry_roundId_idx"
  ON "MatchScoreEntry"("roundId");

ALTER TABLE "MatchScoreEntry"
  ADD CONSTRAINT "MatchScoreEntry_matchId_fkey"
    FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MatchScoreEntry_participantId_matchId_fkey"
    FOREIGN KEY ("participantId", "matchId") REFERENCES "MatchParticipant"("id", "matchId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MatchScoreEntry_roundId_matchId_fkey"
    FOREIGN KEY ("roundId", "matchId") REFERENCES "Round"("id", "matchId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MatchScoreEntry_answerId_fkey"
    FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
