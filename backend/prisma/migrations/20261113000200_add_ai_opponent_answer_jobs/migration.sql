CREATE TYPE "AiAnswerJobStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "AiAnswerJob" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "roundId" UUID NOT NULL,
  "participantId" UUID NOT NULL,
  "status" "AiAnswerJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseId" UUID,
  "leaseAt" TIMESTAMPTZ(3),
  "lastErrorCode" VARCHAR(64),
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  CONSTRAINT "AiAnswerJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiAnswerJob_roundId_matchId_fkey"
    FOREIGN KEY ("roundId", "matchId")
    REFERENCES "Round"("id", "matchId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiAnswerJob_participantId_matchId_fkey"
    FOREIGN KEY ("participantId", "matchId")
    REFERENCES "MatchParticipant"("id", "matchId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AiAnswerJob_idempotencyKey_key" ON "AiAnswerJob"("idempotencyKey");
CREATE UNIQUE INDEX "AiAnswerJob_roundId_participantId_key" ON "AiAnswerJob"("roundId", "participantId");
CREATE INDEX "AiAnswerJob_status_availableAt_idx" ON "AiAnswerJob"("status", "availableAt");
CREATE INDEX "AiAnswerJob_status_leaseAt_idx" ON "AiAnswerJob"("status", "leaseAt");
CREATE INDEX "AiAnswerJob_matchId_createdAt_idx" ON "AiAnswerJob"("matchId", "createdAt");
