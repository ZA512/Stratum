ALTER TABLE "Node" ADD COLUMN "workspaceId" TEXT;

UPDATE "Node" AS n
SET "workspaceId" = b."id"
FROM "Board" AS b
WHERE b."nodeId" = n."id";

UPDATE "Node" AS n
SET "workspaceId" = c."boardId"
FROM "Column" AS c
WHERE c."id" = n."columnId" AND n."workspaceId" IS NULL;

-- Guardrail: ensure every node received a workspace identifier.
DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing_count FROM "Node" WHERE "workspaceId" IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Unable to backfill workspaceId for % node(s). Please assign a boardId manually before rerunning the migration.', missing_count;
  END IF;
END $$;

ALTER TABLE "Node" ALTER COLUMN "workspaceId" SET NOT NULL;

CREATE INDEX "Node_workspaceId_idx" ON "Node"("workspaceId");
