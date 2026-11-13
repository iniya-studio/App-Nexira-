-- Add PROCESSING as a distinct lease state for asynchronous AI answer judging.
-- Kept in its own migration so PostgreSQL commits the new enum value before it is used.
ALTER TYPE "JudgeStatus" ADD VALUE 'PROCESSING';
