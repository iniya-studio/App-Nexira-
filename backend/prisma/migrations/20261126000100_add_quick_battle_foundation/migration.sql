-- Independent Quick Battle persistence. This migration intentionally does not add
-- QUICK_BATTLE to MatchMode: QuickBattleMatch is a separate aggregate and is never
-- selected by the existing 1v1/1vAI Match workers.
CREATE TYPE "QuickBattleStatus" AS ENUM ('PREPARING', 'READY', 'ACTIVE', 'COMPLETED', 'VOIDED', 'CANCELLED');
CREATE TYPE "QuickBattleGenerationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "QuickBattleMatch" (
  "id" UUID NOT NULL,
  "userId" UUID,
  "guestIdentityId" UUID,
  "status" "QuickBattleStatus" NOT NULL DEFAULT 'PREPARING',
  "language" VARCHAR(16) NOT NULL,
  "roundsTarget" INTEGER NOT NULL DEFAULT 10,
  "currentRound" INTEGER NOT NULL DEFAULT 0,
  "generationPolicyVersion" VARCHAR(64) NOT NULL DEFAULT 'quick-battle-generation-v1',
  "scoringPolicyVersion" VARCHAR(64) NOT NULL DEFAULT 'quick-battle-scoring-pending',
  "startedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "voidedAt" TIMESTAMPTZ(3),
  "voidReason" VARCHAR(64),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "QuickBattleMatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuickBattleMatch_owner_xor_check" CHECK (("userId" IS NOT NULL)::integer + ("guestIdentityId" IS NOT NULL)::integer = 1),
  CONSTRAINT "QuickBattleMatch_rounds_target_check" CHECK ("roundsTarget" = 10),
  CONSTRAINT "QuickBattleMatch_current_round_check" CHECK ("currentRound" >= 0 AND "currentRound" <= "roundsTarget"),
  CONSTRAINT "QuickBattleMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QuickBattleMatch_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "GuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "QuickBattleMatch_status_createdAt_idx" ON "QuickBattleMatch"("status", "createdAt");
CREATE INDEX "QuickBattleMatch_userId_status_createdAt_idx" ON "QuickBattleMatch"("userId", "status", "createdAt");
CREATE INDEX "QuickBattleMatch_guestIdentityId_status_createdAt_idx" ON "QuickBattleMatch"("guestIdentityId", "status", "createdAt");
-- Enforce one active/preparing match per principal under concurrent start requests.
CREATE UNIQUE INDEX "QuickBattleMatch_one_active_user_idx" ON "QuickBattleMatch"("userId")
  WHERE "userId" IS NOT NULL AND "status" IN ('PREPARING', 'READY', 'ACTIVE');
CREATE UNIQUE INDEX "QuickBattleMatch_one_active_guest_idx" ON "QuickBattleMatch"("guestIdentityId")
  WHERE "guestIdentityId" IS NOT NULL AND "status" IN ('PREPARING', 'READY', 'ACTIVE');

CREATE TABLE "QuickBattleRound" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "roundNumber" INTEGER NOT NULL,
  "category" VARCHAR(64) NOT NULL,
  "subcategoryId" VARCHAR(64) NOT NULL,
  "difficulty" VARCHAR(32) NOT NULL,
  "questionId" UUID,
  "startedAt" TIMESTAMPTZ(3),
  "deadlineAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "voidedAt" TIMESTAMPTZ(3),
  "voidReason" VARCHAR(64),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuickBattleRound_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuickBattleRound_roundNumber_check" CHECK ("roundNumber" BETWEEN 1 AND 10),
  CONSTRAINT "QuickBattleRound_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "QuickBattleMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QuickBattleRound_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QuickBattleRound_matchId_roundNumber_key" ON "QuickBattleRound"("matchId", "roundNumber");
CREATE UNIQUE INDEX "QuickBattleRound_id_matchId_key" ON "QuickBattleRound"("id", "matchId");
CREATE UNIQUE INDEX "QuickBattleRound_questionId_key" ON "QuickBattleRound"("questionId");
CREATE INDEX "QuickBattleRound_matchId_startedAt_idx" ON "QuickBattleRound"("matchId", "startedAt");

CREATE TABLE "QuickBattleQuestionJob" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "roundId" UUID NOT NULL,
  "generatedQuestionId" UUID,
  "status" "QuickBattleGenerationStatus" NOT NULL DEFAULT 'PENDING',
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
  CONSTRAINT "QuickBattleQuestionJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuickBattleQuestionJob_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "QuickBattleMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QuickBattleQuestionJob_roundId_matchId_fkey" FOREIGN KEY ("roundId", "matchId") REFERENCES "QuickBattleRound"("id", "matchId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QuickBattleQuestionJob_generatedQuestionId_fkey" FOREIGN KEY ("generatedQuestionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QuickBattleQuestionJob_attempts_check" CHECK ("attempts" >= 0 AND "maxAttempts" > 0)
);
CREATE UNIQUE INDEX "QuickBattleQuestionJob_roundId_key" ON "QuickBattleQuestionJob"("roundId");
CREATE UNIQUE INDEX "QuickBattleQuestionJob_generatedQuestionId_key" ON "QuickBattleQuestionJob"("generatedQuestionId");
CREATE UNIQUE INDEX "QuickBattleQuestionJob_idempotencyKey_key" ON "QuickBattleQuestionJob"("idempotencyKey");
CREATE INDEX "QuickBattleQuestionJob_status_availableAt_idx" ON "QuickBattleQuestionJob"("status", "availableAt");
CREATE INDEX "QuickBattleQuestionJob_status_leaseAt_idx" ON "QuickBattleQuestionJob"("status", "leaseAt");
CREATE INDEX "QuickBattleQuestionJob_matchId_createdAt_idx" ON "QuickBattleQuestionJob"("matchId", "createdAt");

CREATE TABLE "QuickBattleAnswer" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "roundId" UUID NOT NULL,
  "responseText" TEXT,
  "status" "AnswerStatus" NOT NULL,
  "judgeStatus" "JudgeStatus" NOT NULL DEFAULT 'PENDING',
  "decision" "JudgeDecision",
  "confidence" DOUBLE PRECISION,
  "elapsedMs" INTEGER NOT NULL,
  "points" INTEGER,
  "judgeReason" TEXT,
  "judgeVersion" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "judgedAt" TIMESTAMPTZ(3),
  CONSTRAINT "QuickBattleAnswer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuickBattleAnswer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "QuickBattleMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QuickBattleAnswer_roundId_matchId_fkey" FOREIGN KEY ("roundId", "matchId") REFERENCES "QuickBattleRound"("id", "matchId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QuickBattleAnswer_elapsedMs_check" CHECK ("elapsedMs" >= 0)
);
CREATE UNIQUE INDEX "QuickBattleAnswer_roundId_key" ON "QuickBattleAnswer"("roundId");
CREATE UNIQUE INDEX "QuickBattleAnswer_roundId_matchId_key" ON "QuickBattleAnswer"("roundId", "matchId");
CREATE UNIQUE INDEX "QuickBattleAnswer_idempotencyKey_key" ON "QuickBattleAnswer"("idempotencyKey");
CREATE INDEX "QuickBattleAnswer_matchId_acceptedAt_idx" ON "QuickBattleAnswer"("matchId", "acceptedAt");
CREATE INDEX "QuickBattleAnswer_judgeStatus_acceptedAt_idx" ON "QuickBattleAnswer"("judgeStatus", "acceptedAt");

