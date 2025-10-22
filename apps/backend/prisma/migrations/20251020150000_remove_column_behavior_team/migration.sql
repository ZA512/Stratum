-- Drop the foreign key linking column behaviors to teams
ALTER TABLE "stratum"."ColumnBehavior"
  DROP CONSTRAINT IF EXISTS "ColumnBehavior_teamId_fkey";

-- Remove the legacy team reference now that behaviors are global
ALTER TABLE "stratum"."ColumnBehavior"
  DROP COLUMN IF EXISTS "teamId";
