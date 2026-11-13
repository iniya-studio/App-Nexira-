-- Initial match generation jobs have no source round. Recovery jobs retain their
-- source-round relation; the unique idempotency key protects initial jobs.
ALTER TABLE "QuestionGenerationJob"
  ALTER COLUMN "sourceRoundId" DROP NOT NULL;
