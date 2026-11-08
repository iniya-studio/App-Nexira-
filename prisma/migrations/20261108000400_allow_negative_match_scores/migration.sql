-- Match scoring permits negative totals: the approved consecutive
-- no-response penalties can reduce a participant to -20 before forfeiture.
-- Keep the authoritative database invariant aligned with the existing game engine.
ALTER TABLE "MatchParticipant"
  DROP CONSTRAINT "MatchParticipant_score_nonnegative_check";
