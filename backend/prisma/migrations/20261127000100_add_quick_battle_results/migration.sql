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

CREATE FUNCTION "prevent_quick_battle_result_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Quick Battle finalized results are immutable';
END;
$$;

CREATE TRIGGER "QuickBattleResult_immutable"
BEFORE UPDATE OR DELETE ON "QuickBattleResult"
FOR EACH ROW
EXECUTE FUNCTION "prevent_quick_battle_result_mutation"();

CREATE FUNCTION "prevent_quick_battle_answer_score_mutation_after_finalization"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."points" IS DISTINCT FROM NEW."points"
     AND EXISTS (
       SELECT 1 FROM "QuickBattleResult"
       WHERE "matchId" = OLD."matchId"
     ) THEN
    RAISE EXCEPTION 'Quick Battle finalized answer scores are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "QuickBattleAnswer_score_immutable_after_result"
BEFORE UPDATE OF "points" ON "QuickBattleAnswer"
FOR EACH ROW
EXECUTE FUNCTION "prevent_quick_battle_answer_score_mutation_after_finalization"();
