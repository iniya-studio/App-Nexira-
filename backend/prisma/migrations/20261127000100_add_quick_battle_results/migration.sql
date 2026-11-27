ALTER TABLE "QuickBattleMatch"
  ALTER COLUMN "scoringPolicyVersion" SET DEFAULT 'quick-battle-score-v1';

CREATE TABLE "QuickBattleResult" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "matchId" UUID NOT NULL,
  "scoringPolicyVersion" VARCHAR(64) NOT NULL,
  "totalPoints" INTEGER NOT NULL,
  "correctAnswers" INTEGER NOT NULL,
  "incorrectAnswers" INTEGER NOT NULL,
  "noResponseCount" INTEGER NOT NULL,
  "finalizedAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QuickBattleResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuickBattleResult_matchId_key" UNIQUE ("matchId"),
  CONSTRAINT "QuickBattleResult_totalPoints_check" CHECK ("totalPoints" BETWEEN 0 AND 1500),
  CONSTRAINT "QuickBattleResult_correctAnswers_check" CHECK ("correctAnswers" BETWEEN 0 AND 10),
  CONSTRAINT "QuickBattleResult_incorrectAnswers_check" CHECK ("incorrectAnswers" BETWEEN 0 AND 10),
  CONSTRAINT "QuickBattleResult_noResponseCount_check" CHECK ("noResponseCount" BETWEEN 0 AND 10),
  CONSTRAINT "QuickBattleResult_outcomeCount_check" CHECK (
    "correctAnswers" + "incorrectAnswers" + "noResponseCount" = 10
  ),
  CONSTRAINT "QuickBattleResult_matchId_fkey"
    FOREIGN KEY ("matchId") REFERENCES "QuickBattleMatch"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "QuickBattleResult_finalizedAt_idx"
  ON "QuickBattleResult"("finalizedAt");
