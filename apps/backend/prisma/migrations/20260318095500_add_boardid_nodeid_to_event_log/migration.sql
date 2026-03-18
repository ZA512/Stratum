-- AlterTable
ALTER TABLE "stratum"."EventLog"
ADD COLUMN "boardId" TEXT,
ADD COLUMN "nodeId" TEXT;

-- Backfill from existing payload snapshots when available
UPDATE "stratum"."EventLog"
SET
  "boardId" = NULLIF("payload" -> 'node' ->> 'boardId', ''),
  "nodeId" = NULLIF("payload" -> 'node' ->> 'id', '')
WHERE "payload" ? 'node';

-- CreateIndex
CREATE INDEX "EventLog_boardId_createdAt_idx"
ON "stratum"."EventLog"("boardId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EventLog_nodeId_createdAt_idx"
ON "stratum"."EventLog"("nodeId", "createdAt" DESC);