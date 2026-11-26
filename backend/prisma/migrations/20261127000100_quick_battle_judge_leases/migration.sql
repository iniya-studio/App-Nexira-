-- Dedicated Quick Battle AI Judge queue metadata.
-- This migration does not alter the existing Answer table or its 1v1/1vAI worker.
ALTER TABLE "QuickBattleAnswer"
  ADD COLUMN "judgeAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "judgeStartedAt" TIMESTAMPTZ(3),
  ADD COLUMN "judgeAvailableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "judgeLeaseId" UUID,
  ADD COLUMN "lastErrorCode" VARCHAR(64);

ALTER TABLE "QuickBattleAnswer"
  ADD CONSTRAINT "QuickBattleAnswer_judgeAttempts_check" CHECK ("judgeAttempts" >= 0);

DROP INDEX IF EXISTS "QuickBattleAnswer_judgeStatus_acceptedAt_idx";

CREATE INDEX "QuickBattleAnswer_judgeStatus_judgeAvailableAt_idx"
  ON "QuickBattleAnswer"("judgeStatus", "judgeAvailableAt");
