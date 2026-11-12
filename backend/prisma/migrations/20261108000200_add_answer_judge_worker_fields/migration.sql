-- Persist retry, availability, and lease state for provider-independent AI judging.
ALTER TABLE "Answer"
  ADD COLUMN "judgeAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "judgeStartedAt" TIMESTAMPTZ(3),
  ADD COLUMN "judgeAvailableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "judgeLeaseId" UUID;

ALTER TABLE "Answer"
  ADD CONSTRAINT "Answer_judge_attempts_nonnegative_check"
    CHECK ("judgeAttempts" >= 0),
  ADD CONSTRAINT "Answer_judge_processing_lease_check"
    CHECK (
      ("judgeStatus" = 'PROCESSING' AND "judgeStartedAt" IS NOT NULL AND "judgeLeaseId" IS NOT NULL)
      OR
      ("judgeStatus" <> 'PROCESSING' AND "judgeStartedAt" IS NULL AND "judgeLeaseId" IS NULL)
    );

CREATE INDEX "Answer_judgeStatus_judgeAvailableAt_idx"
  ON "Answer"("judgeStatus", "judgeAvailableAt");
