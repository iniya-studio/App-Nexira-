-- Snapshot each human participant's locale at match creation.
-- Historical rows are backfilled from trusted user profile or the matched queue entry;
-- legacy rows without either source retain the deterministic English default.
ALTER TABLE "MatchParticipant"
  ADD COLUMN "language" VARCHAR(16);

UPDATE "MatchParticipant" AS participant
SET "language" = COALESCE(
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
    SELECT job."requestContext"->>'language'
    FROM "QuestionGenerationJob" AS job
    WHERE job."matchId" = participant."matchId"
    ORDER BY job."createdAt" ASC
    LIMIT 1
  )), ''),
  NULLIF(BTRIM((
    SELECT "preferredLanguage"
    FROM "User"
    WHERE "User"."id" = participant."userId"
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

-- AI participants have no user-facing locale; every HUMAN must have a snapshot.
ALTER TABLE "MatchParticipant"
  ADD CONSTRAINT "MatchParticipant_language_by_type_check"
  CHECK (
    ("participantType" = 'HUMAN'::"ParticipantType" AND "language" IS NOT NULL)
    OR
    ("participantType" = 'AI'::"ParticipantType" AND "language" IS NULL)
  );


-- Upgrade pending durable generation jobs to the new participant-locale context.
UPDATE "QuestionGenerationJob" AS job
SET "requestContext" = jsonb_set(
  COALESCE(job."requestContext"::jsonb, '{}'::jsonb),
  '{requiredLocales}',
  COALESCE((
    SELECT jsonb_agg(DISTINCT participant."language" ORDER BY participant."language")
    FROM "MatchParticipant" AS participant
    WHERE participant."matchId" = job."matchId"
      AND participant."participantType" = 'HUMAN'::"ParticipantType"
      AND participant."language" IS NOT NULL
  ), '[]'::jsonb),
  true
)
WHERE job."status" IN ('PENDING'::"QuestionGenerationJobStatus", 'PROCESSING'::"QuestionGenerationJobStatus")
  AND NOT (COALESCE(job."requestContext"::jsonb, '{}'::jsonb) ? 'requiredLocales');
