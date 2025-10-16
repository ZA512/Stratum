-- Personal board isolation migration
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "isPersonal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Board" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE "Board" ADD COLUMN IF NOT EXISTS "isPersonal" BOOLEAN NOT NULL DEFAULT false;

-- Indexes to speed up lookups
CREATE INDEX IF NOT EXISTS "team_personal_idx" ON "Team"("isPersonal");
CREATE INDEX IF NOT EXISTS "board_owner_idx" ON "Board"("ownerUserId");
CREATE INDEX IF NOT EXISTS "board_personal_idx" ON "Board"("isPersonal");
