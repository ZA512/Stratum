-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'SHARE_INVITE_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'SHARE_INVITE_ACCEPTED';
ALTER TYPE "ActivityType" ADD VALUE 'SHARE_INVITE_DECLINED';
ALTER TYPE "ActivityType" ADD VALUE 'SHARE_INVITE_EXPIRED';
ALTER TYPE "ActivityType" ADD VALUE 'SHARE_LINK_REMOVED';
ALTER TYPE "ActivityType" ADD VALUE 'KANBAN_SOFT_DELETED';
ALTER TYPE "ActivityType" ADD VALUE 'KANBAN_RESTORED';
ALTER TYPE "ActivityType" ADD VALUE 'KANBAN_MOVED';
ALTER TYPE "ActivityType" ADD VALUE 'KANBAN_MOVE_REFUSED';
ALTER TYPE "ActivityType" ADD VALUE 'KANBAN_BECAME_SHARED';

-- AlterTable
ALTER TABLE "SharedNodePlacement" ADD COLUMN     "archivedAt" TIMESTAMP(3);
