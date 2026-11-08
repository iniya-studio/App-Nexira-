CREATE TYPE "QuestionGenerationJobStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

ALTER TABLE "Question"
  ADD COLUMN "category" VARCHAR(64) NOT NULL DEFAULT 'general',
  ADD COLUMN "difficulty" VARCHAR(32) NOT NULL DEFAULT 'medium',
  ADD COLUMN "generatorVersion" TEXT,
  ADD COLUMN "modelVersion" TEXT,
  ADD COLUMN "generationPolicyVersion" TEXT,
  ADD COLUMN "contentFingerprint" VARCHAR(64);

CREATE INDEX "Question_contentFingerprint_idx"
  ON "Question"("contentFingerprint");

ALTER TABLE "Round"
  ADD COLUMN "readinessExpiresAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT "Round_readiness_expiry_check"
    CHECK ("readinessExpiresAt" IS NULL OR "startedAt" IS NULL);

CREATE TABLE "QuestionGenerationJob" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "sourceRoundId" UUID NOT NULL,
  "generatedQuestionId" UUID,
  "status" "QuestionGenerationJobStatus" NOT NULL DEFAULT 'PENDING',
  "triggerReason" VARCHAR(64) NOT NULL,
  "requestContext" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseId" UUID,
  "leaseAt" TIMESTAMPTZ(3),
  "lastErrorCode" VARCHAR(64),
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  CONSTRAINT "QuestionGenerationJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuestionGenerationJob_sourceRoundId_key" UNIQUE ("sourceRoundId"),
  CONSTRAINT "QuestionGenerationJob_sourceRoundId_matchId_key" UNIQUE ("sourceRoundId", "matchId"),
  CONSTRAINT "QuestionGenerationJob_generatedQuestionId_key" UNIQUE ("generatedQuestionId"),
  CONSTRAINT "QuestionGenerationJob_idempotencyKey_key" UNIQUE ("idempotencyKey"),
  CONSTRAINT "QuestionGenerationJob_attempts_check"
    CHECK ("attempts" >= 0 AND "maxAttempts" = 3 AND "attempts" <= "maxAttempts"),
  CONSTRAINT "QuestionGenerationJob_lease_check"
    CHECK (
      ("status" = 'PROCESSING' AND "leaseId" IS NOT NULL AND "leaseAt" IS NOT NULL)
      OR
      ("status" <> 'PROCESSING' AND "leaseId" IS NULL AND "leaseAt" IS NULL)
    )
);

CREATE INDEX "QuestionGenerationJob_status_availableAt_idx"
  ON "QuestionGenerationJob"("status", "availableAt");
CREATE INDEX "QuestionGenerationJob_matchId_createdAt_idx"
  ON "QuestionGenerationJob"("matchId", "createdAt");

ALTER TABLE "QuestionGenerationJob"
  ADD CONSTRAINT "QuestionGenerationJob_matchId_fkey"
    FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "QuestionGenerationJob_sourceRoundId_matchId_fkey"
    FOREIGN KEY ("sourceRoundId", "matchId") REFERENCES "Round"("id", "matchId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "QuestionGenerationJob_generatedQuestionId_fkey"
    FOREIGN KEY ("generatedQuestionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RoundReadiness" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "roundId" UUID NOT NULL,
  "participantId" UUID NOT NULL,
  "isReady" BOOLEAN NOT NULL DEFAULT false,
  "readyAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoundReadiness_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RoundReadiness_roundId_participantId_key" UNIQUE ("roundId", "participantId"),
  CONSTRAINT "RoundReadiness_ready_state_check"
    CHECK (("isReady" AND "readyAt" IS NOT NULL) OR (NOT "isReady" AND "readyAt" IS NULL))
);

CREATE INDEX "RoundReadiness_matchId_isReady_idx"
  ON "RoundReadiness"("matchId", "isReady");

ALTER TABLE "RoundReadiness"
  ADD CONSTRAINT "RoundReadiness_roundId_matchId_fkey"
    FOREIGN KEY ("roundId", "matchId") REFERENCES "Round"("id", "matchId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RoundReadiness_participantId_matchId_fkey"
    FOREIGN KEY ("participantId", "matchId") REFERENCES "MatchParticipant"("id", "matchId") ON DELETE CASCADE ON UPDATE CASCADE;
