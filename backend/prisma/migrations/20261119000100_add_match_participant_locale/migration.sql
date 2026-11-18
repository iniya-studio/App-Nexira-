-- Snapshot each human participant's locale at match creation.
-- Historical rows are backfilled from trusted user profile or the matched queue entry;
-- legacy rows without either source retain the deterministic English default.
ALTER TABLE "MatchParticipant"
  ADD COLUMN "language" VARCHAR(16) NOT NULL DEFAULT 'en';

UPDATE "MatchParticipant" AS participant
SET "language" = COALESCE(
  NULLIF(BTRIM((
    SELECT "preferredLanguage"
    FROM "User"
    WHERE "User"."id" = participant."userId"
  )), ''),
  NULLIF(BTRIM((
    SELECT "language"
    FROM "MatchmakingEntry"
    WHERE "MatchmakingEntry"."matchId" = participant."matchId"
      AND "MatchmakingEntry"."userId" = participant."userId"
    ORDER BY "queuedAt" DESC
    LIMIT 1
  )), ''),
  NULLIF(BTRIM((
    SELECT "language"
    FROM "MatchmakingEntry"
    WHERE "MatchmakingEntry"."matchId" = participant."matchId"
      AND "MatchmakingEntry"."guestIdentityId" = participant."guestIdentityId"
    ORDER BY "queuedAt" DESC
    LIMIT 1
  )), ''),
  NULLIF(BTRIM((
    SELECT "Question"."canonicalLanguage"
    FROM "Round"
    JOIN "Question" ON "Question"."id" = "Round"."questionId"
    WHERE "Round"."matchId" = participant."matchId"
    ORDER BY "Round"."roundNumber" ASC
    LIMIT 1
  )), ''),
  'en'
)
WHERE participant."participantType" = 'HUMAN'::"ParticipantType";
