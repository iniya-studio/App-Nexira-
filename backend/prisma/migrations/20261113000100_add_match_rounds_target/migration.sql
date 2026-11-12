ALTER TABLE "Match"
  ADD COLUMN "roundsTarget" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "Match"
  ADD CONSTRAINT "Match_roundsTarget_supported"
  CHECK ("roundsTarget" IN (10, 15));
