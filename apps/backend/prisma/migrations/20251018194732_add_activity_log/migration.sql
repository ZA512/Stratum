-- CreateEnum
CREATE TYPE "stratum"."ActivityType" AS ENUM ('NODE_CREATED', 'NODE_UPDATED', 'NODE_MOVED', 'NODE_DELETED', 'NODE_ARCHIVED', 'NODE_RESTORED', 'NODE_SNOOZED', 'NODE_UNSNOOZED', 'COLLABORATOR_ADDED', 'COLLABORATOR_REMOVED', 'INVITATION_SENT', 'INVITATION_ACCEPTED', 'INVITATION_DECLINED', 'COMMENT_ADDED', 'DESCRIPTION_UPDATED', 'TITLE_UPDATED', 'DUE_DATE_UPDATED', 'PRIORITY_UPDATED', 'EFFORT_UPDATED', 'TAGS_UPDATED', 'ASSIGNEES_UPDATED', 'MOVED_TO_BOARD', 'PROGRESS_UPDATED', 'BLOCKED_STATUS_CHANGED', 'RACI_UPDATED');

-- CreateTable
CREATE TABLE "stratum"."ActivityLog" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "stratum"."ActivityType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityLog_nodeId_createdAt_idx" ON "stratum"."ActivityLog"("nodeId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "stratum"."ActivityLog"("userId");

-- CreateIndex
CREATE INDEX "ActivityLog_type_idx" ON "stratum"."ActivityLog"("type");

-- AddForeignKey
ALTER TABLE "stratum"."ActivityLog" ADD CONSTRAINT "ActivityLog_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "stratum"."Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stratum"."ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "stratum"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
