-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "PrincipalType" AS ENUM ('USER', 'GUEST');

-- CreateEnum
CREATE TYPE "GuestIdentityStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "IdentityAuditResult" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "MatchMode" AS ENUM ('ONE_V_ONE', 'ONE_V_AI', 'ROOM');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('WAITING', 'READY', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ParticipantType" AS ENUM ('HUMAN', 'AI');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DISCONNECTED', 'FORFEITED');

-- CreateEnum
CREATE TYPE "AnswerStatus" AS ENUM ('ANSWERED', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "JudgeDecision" AS ENUM ('CORRECT', 'INCORRECT', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "JudgeStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "RoomMatchStrategy" AS ENUM ('SYNCHRONIZED', 'HOST_CONTROLLED');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('OPEN', 'COUNTDOWN', 'IN_MATCH', 'CLOSED');

-- CreateEnum
CREATE TYPE "RoomMemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "RankingSeasonStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RankingScope" AS ENUM ('GLOBAL', 'SEASON');

-- CreateEnum
CREATE TYPE "StoreItemType" AS ENUM ('AVATAR', 'AVATAR_FRAME', 'PROFILE_THEME', 'NAMEPLATE', 'EMOTE');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "guestIdentityId" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountCredential" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "passwordChangedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AccountCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "providerSubject" VARCHAR(255) NOT NULL,
    "providerEmail" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestIdentity" (
    "id" UUID NOT NULL,
    "status" "GuestIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    "convertedToUserId" UUID,
    "convertedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GuestIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "tokenHash" VARCHAR(255) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "replacedByTokenId" UUID,
    "idempotencyKeyHash" VARCHAR(255) NOT NULL,
    "retryResponseCiphertext" TEXT,
    "retryResponseExpiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "guestIdentityId" UUID,
    "tokenHash" VARCHAR(255) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityAuditEvent" (
    "id" UUID NOT NULL,
    "eventType" VARCHAR(64) NOT NULL,
    "principalType" "PrincipalType",
    "principalId" UUID,
    "sessionId" UUID,
    "result" "IdentityAuditResult" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProgress" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "currentLevelXp" INTEGER NOT NULL DEFAULT 0,
    "totalXp" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XPTransaction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "matchId" UUID,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XPTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" UUID NOT NULL,
    "mode" "MatchMode" NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'WAITING',
    "roomId" UUID,
    "roomMatchStrategy" "RoomMatchStrategy",
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchParticipant" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "userId" UUID,
    "guestIdentityId" UUID,
    "participantKey" TEXT NOT NULL,
    "participantType" "ParticipantType" NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "score" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "questionId" UUID,
    "startedAt" TIMESTAMPTZ(3),
    "deadlineAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" UUID NOT NULL,
    "canonicalLanguage" TEXT NOT NULL,
    "answerType" TEXT NOT NULL,
    "canonicalPrompt" TEXT NOT NULL,
    "canonicalOptions" JSONB,
    "answerKey" TEXT NOT NULL,
    "gradingRubric" JSONB NOT NULL,
    "localized" JSONB NOT NULL,
    "timeLimitSeconds" INTEGER NOT NULL,
    "contentVersion" TEXT NOT NULL,
    "judgeVersion" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "responseText" TEXT,
    "status" "AnswerStatus" NOT NULL,
    "judgeStatus" "JudgeStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "decision" "JudgeDecision",
    "confidence" DOUBLE PRECISION,
    "elapsedMs" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "speedBonus" INTEGER NOT NULL DEFAULT 0,
    "judgeReason" TEXT,
    "judgeVersion" TEXT,
    "idempotencyKey" TEXT,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "winnerParticipantId" UUID,
    "resultSummary" JSONB NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "hostUserId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "roomType" "RoomType" NOT NULL DEFAULT 'PRIVATE',
    "inviteCodeHash" TEXT,
    "matchStrategy" "RoomMatchStrategy" NOT NULL DEFAULT 'SYNCHRONIZED',
    "status" "RoomStatus" NOT NULL DEFAULT 'OPEN',
    "maxPlayers" INTEGER NOT NULL,
    "minPlayersToStart" INTEGER NOT NULL,
    "countdownStartedAt" TIMESTAMPTZ(3),
    "countdownEndsAt" TIMESTAMPTZ(3),
    "settings" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomMember" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "RoomMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "isReady" BOOLEAN NOT NULL DEFAULT false,
    "readyAt" TIMESTAMPTZ(3),
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMPTZ(3),
    "leftAt" TIMESTAMPTZ(3),

    CONSTRAINT "RoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankingSeason" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RankingSeasonStatus" NOT NULL DEFAULT 'UPCOMING',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankingSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRanking" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "rankingPoints" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserRanking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalUserRanking" (
    "userId" UUID NOT NULL,
    "rankingPoints" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GlobalUserRanking_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "RankingTransaction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "scope" "RankingScope" NOT NULL,
    "seasonId" UUID,
    "matchId" UUID,
    "pointsChange" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreItem" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "itemType" "StoreItemType" NOT NULL,
    "priceAmount" INTEGER NOT NULL,
    "priceCurrency" VARCHAR(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StoreItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "storeItemId" UUID NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "paymentProvider" TEXT,
    "providerTransactionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInventory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "storeItemId" UUID NOT NULL,
    "sourcePurchaseId" UUID,
    "acquiredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "UserInventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_status_createdAt_idx" ON "User"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UserSession_userId_expiresAt_idx" ON "UserSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "UserSession_guestIdentityId_expiresAt_idx" ON "UserSession"("guestIdentityId", "expiresAt");

-- CreateIndex
CREATE INDEX "UserSession_revokedAt_idx" ON "UserSession"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountCredential_userId_key" ON "AccountCredential"("userId");

-- CreateIndex
CREATE INDEX "ExternalIdentity_userId_provider_idx" ON "ExternalIdentity"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_provider_providerSubject_key" ON "ExternalIdentity"("provider", "providerSubject");

-- CreateIndex
CREATE INDEX "GuestIdentity_status_updatedAt_idx" ON "GuestIdentity"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "GuestIdentity_convertedToUserId_idx" ON "GuestIdentity"("convertedToUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_replacedByTokenId_key" ON "RefreshToken"("replacedByTokenId");

-- CreateIndex
CREATE INDEX "RefreshToken_sessionId_createdAt_idx" ON "RefreshToken"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_revokedAt_idx" ON "RefreshToken"("expiresAt", "revokedAt");

-- CreateIndex
CREATE INDEX "RefreshToken_retryResponseExpiresAt_idx" ON "RefreshToken"("retryResponseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_sessionId_idempotencyKeyHash_key" ON "RefreshToken"("sessionId", "idempotencyKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_expiresAt_idx" ON "EmailVerificationToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_guestIdentityId_expiresAt_idx" ON "EmailVerificationToken"("guestIdentityId", "expiresAt");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_expiresAt_consumedAt_idx" ON "EmailVerificationToken"("expiresAt", "consumedAt");

-- CreateIndex
CREATE INDEX "IdentityAuditEvent_principalType_principalId_createdAt_idx" ON "IdentityAuditEvent"("principalType", "principalId", "createdAt");

-- CreateIndex
CREATE INDEX "IdentityAuditEvent_eventType_createdAt_idx" ON "IdentityAuditEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "IdentityAuditEvent_sessionId_createdAt_idx" ON "IdentityAuditEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserProgress_userId_key" ON "UserProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "XPTransaction_idempotencyKey_key" ON "XPTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "XPTransaction_userId_createdAt_idx" ON "XPTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "XPTransaction_matchId_idx" ON "XPTransaction"("matchId");

-- CreateIndex
CREATE INDEX "Match_status_createdAt_idx" ON "Match"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Match_roomId_createdAt_idx" ON "Match"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchParticipant_userId_joinedAt_idx" ON "MatchParticipant"("userId", "joinedAt");

-- CreateIndex
CREATE INDEX "MatchParticipant_guestIdentityId_joinedAt_idx" ON "MatchParticipant"("guestIdentityId", "joinedAt");

-- CreateIndex
CREATE INDEX "MatchParticipant_matchId_status_idx" ON "MatchParticipant"("matchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MatchParticipant_matchId_participantKey_key" ON "MatchParticipant"("matchId", "participantKey");

-- CreateIndex
CREATE UNIQUE INDEX "MatchParticipant_matchId_userId_key" ON "MatchParticipant"("matchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchParticipant_matchId_guestIdentityId_key" ON "MatchParticipant"("matchId", "guestIdentityId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchParticipant_id_matchId_key" ON "MatchParticipant"("id", "matchId");

-- CreateIndex
CREATE UNIQUE INDEX "Round_questionId_key" ON "Round"("questionId");

-- CreateIndex
CREATE INDEX "Round_matchId_startedAt_idx" ON "Round"("matchId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Round_matchId_roundNumber_key" ON "Round"("matchId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Round_id_matchId_key" ON "Round"("id", "matchId");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_idempotencyKey_key" ON "Answer"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Answer_matchId_roundId_idx" ON "Answer"("matchId", "roundId");

-- CreateIndex
CREATE INDEX "Answer_participantId_acceptedAt_idx" ON "Answer"("participantId", "acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_roundId_participantId_key" ON "Answer"("roundId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchResult_matchId_key" ON "MatchResult"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_inviteCodeHash_key" ON "Room"("inviteCodeHash");

-- CreateIndex
CREATE INDEX "Room_hostUserId_createdAt_idx" ON "Room"("hostUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Room_status_roomType_createdAt_idx" ON "Room"("status", "roomType", "createdAt");

-- CreateIndex
CREATE INDEX "RoomMember_userId_status_idx" ON "RoomMember"("userId", "status");

-- CreateIndex
CREATE INDEX "RoomMember_roomId_status_isReady_idx" ON "RoomMember"("roomId", "status", "isReady");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMember_roomId_userId_key" ON "RoomMember"("roomId", "userId");

-- CreateIndex
CREATE INDEX "RankingSeason_status_startsAt_endsAt_idx" ON "RankingSeason"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "UserRanking_seasonId_rankingPoints_updatedAt_idx" ON "UserRanking"("seasonId", "rankingPoints", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserRanking_userId_seasonId_key" ON "UserRanking"("userId", "seasonId");

-- CreateIndex
CREATE INDEX "GlobalUserRanking_rankingPoints_updatedAt_idx" ON "GlobalUserRanking"("rankingPoints", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RankingTransaction_idempotencyKey_key" ON "RankingTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RankingTransaction_userId_scope_seasonId_createdAt_idx" ON "RankingTransaction"("userId", "scope", "seasonId", "createdAt");

-- CreateIndex
CREATE INDEX "RankingTransaction_matchId_idx" ON "RankingTransaction"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreItem_code_key" ON "StoreItem"("code");

-- CreateIndex
CREATE INDEX "StoreItem_isActive_itemType_idx" ON "StoreItem"("isActive", "itemType");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_providerTransactionId_key" ON "Purchase"("providerTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_idempotencyKey_key" ON "Purchase"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Purchase_userId_status_createdAt_idx" ON "Purchase"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Purchase_storeItemId_createdAt_idx" ON "Purchase"("storeItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserInventory_sourcePurchaseId_key" ON "UserInventory"("sourcePurchaseId");

-- CreateIndex
CREATE INDEX "UserInventory_userId_revokedAt_acquiredAt_idx" ON "UserInventory"("userId", "revokedAt", "acquiredAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserInventory_userId_storeItemId_key" ON "UserInventory"("userId", "storeItemId");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "GuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountCredential" ADD CONSTRAINT "AccountCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestIdentity" ADD CONSTRAINT "GuestIdentity_convertedToUserId_fkey" FOREIGN KEY ("convertedToUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UserSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_replacedByTokenId_fkey" FOREIGN KEY ("replacedByTokenId") REFERENCES "RefreshToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "GuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProgress" ADD CONSTRAINT "UserProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XPTransaction" ADD CONSTRAINT "XPTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XPTransaction" ADD CONSTRAINT "XPTransaction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "GuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_roundId_matchId_fkey" FOREIGN KEY ("roundId", "matchId") REFERENCES "Round"("id", "matchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_participantId_matchId_fkey" FOREIGN KEY ("participantId", "matchId") REFERENCES "MatchParticipant"("id", "matchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_winnerParticipantId_matchId_fkey" FOREIGN KEY ("winnerParticipantId", "matchId") REFERENCES "MatchParticipant"("id", "matchId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRanking" ADD CONSTRAINT "UserRanking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRanking" ADD CONSTRAINT "UserRanking_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "RankingSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalUserRanking" ADD CONSTRAINT "GlobalUserRanking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankingTransaction" ADD CONSTRAINT "RankingTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankingTransaction" ADD CONSTRAINT "RankingTransaction_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "RankingSeason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankingTransaction" ADD CONSTRAINT "RankingTransaction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_storeItemId_fkey" FOREIGN KEY ("storeItemId") REFERENCES "StoreItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInventory" ADD CONSTRAINT "UserInventory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInventory" ADD CONSTRAINT "UserInventory_storeItemId_fkey" FOREIGN KEY ("storeItemId") REFERENCES "StoreItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInventory" ADD CONSTRAINT "UserInventory_sourcePurchaseId_fkey" FOREIGN KEY ("sourcePurchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Enforce exactly one session owner: registered user or guest identity.
ALTER TABLE "UserSession"
  ADD CONSTRAINT "UserSession_exactly_one_owner_check"
  CHECK (("userId" IS NOT NULL AND "guestIdentityId" IS NULL)
      OR ("userId" IS NULL AND "guestIdentityId" IS NOT NULL));

-- Guest conversion state must agree with its conversion metadata.
ALTER TABLE "GuestIdentity"
  ADD CONSTRAINT "GuestIdentity_conversion_state_check"
  CHECK (
    ("status" = 'ACTIVE' AND "convertedToUserId" IS NULL AND "convertedAt" IS NULL)
    OR ("status" = 'CONVERTED' AND "convertedToUserId" IS NOT NULL AND "convertedAt" IS NOT NULL)
    OR ("status" = 'REVOKED' AND (
      ("convertedToUserId" IS NULL AND "convertedAt" IS NULL)
      OR ("convertedToUserId" IS NOT NULL AND "convertedAt" IS NOT NULL)
    ))
  );

-- A HUMAN is backed by exactly one account/guest; an AI has neither.
ALTER TABLE "MatchParticipant"
  ADD CONSTRAINT "MatchParticipant_identity_by_type_check"
  CHECK (
    ("participantType" = 'HUMAN' AND num_nonnulls("userId", "guestIdentityId") = 1)
    OR ("participantType" = 'AI' AND "userId" IS NULL AND "guestIdentityId" IS NULL)
  ),
  ADD CONSTRAINT "MatchParticipant_score_nonnegative_check"
  CHECK ("score" >= 0);

-- ROOM matches snapshot room and strategy; other modes must not carry room data.
ALTER TABLE "Match"
  ADD CONSTRAINT "Match_room_fields_by_mode_check"
  CHECK (
    ("mode" = 'ROOM' AND "roomId" IS NOT NULL AND "roomMatchStrategy" IS NOT NULL)
    OR ("mode" <> 'ROOM' AND "roomId" IS NULL AND "roomMatchStrategy" IS NULL)
  ),
  ADD CONSTRAINT "Match_current_round_nonnegative_check"
  CHECK ("currentRound" >= 0);

-- Keep encrypted refresh retry payload and its expiry as an atomic pair.
ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RefreshToken_retry_response_pair_check"
  CHECK (("retryResponseCiphertext" IS NULL AND "retryResponseExpiresAt" IS NULL)
      OR ("retryResponseCiphertext" IS NOT NULL AND "retryResponseExpiresAt" IS NOT NULL)),
  ADD CONSTRAINT "RefreshToken_not_own_replacement_check"
  CHECK ("replacedByTokenId" IS NULL OR "replacedByTokenId" <> "id");

ALTER TABLE "RankingTransaction"
  ADD CONSTRAINT "RankingTransaction_scope_season_check"
  CHECK (("scope" = 'GLOBAL' AND "seasonId" IS NULL)
      OR ("scope" = 'SEASON' AND "seasonId" IS NOT NULL));

ALTER TABLE "RankingSeason"
  ADD CONSTRAINT "RankingSeason_valid_period_check"
  CHECK ("startsAt" < "endsAt");

ALTER TABLE "UserProgress"
  ADD CONSTRAINT "UserProgress_nonnegative_values_check"
  CHECK ("level" >= 1 AND "currentLevelXp" >= 0 AND "totalXp" >= 0);

ALTER TABLE "Room"
  ADD CONSTRAINT "Room_valid_capacity_check"
  CHECK ("minPlayersToStart" >= 1 AND "maxPlayers" >= "minPlayersToStart");

ALTER TABLE "Question"
  ADD CONSTRAINT "Question_positive_time_limit_check"
  CHECK ("timeLimitSeconds" > 0);

ALTER TABLE "Round"
  ADD CONSTRAINT "Round_positive_number_check"
  CHECK ("roundNumber" >= 1);

ALTER TABLE "Answer"
  ADD CONSTRAINT "Answer_nonnegative_scoring_values_check"
  CHECK ("elapsedMs" >= 0 AND "points" >= 0 AND "speedBonus" >= 0),
  ADD CONSTRAINT "Answer_confidence_range_check"
  CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)),
  ADD CONSTRAINT "Answer_no_response_consistency_check"
  CHECK (
    "status" <> 'NO_RESPONSE'
    OR ("responseText" IS NULL AND "decision" IS NULL
        AND "judgeStatus" = 'NOT_REQUIRED' AND "points" = 0 AND "speedBonus" = 0)
  ),
  ADD CONSTRAINT "Answer_answered_has_response_check"
  CHECK ("status" <> 'ANSWERED' OR "responseText" IS NOT NULL);

ALTER TABLE "StoreItem"
  ADD CONSTRAINT "StoreItem_nonnegative_price_check"
  CHECK ("priceAmount" >= 0);

ALTER TABLE "Purchase"
  ADD CONSTRAINT "Purchase_nonnegative_amount_check"
  CHECK ("amount" >= 0);
