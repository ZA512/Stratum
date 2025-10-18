-- DropForeignKey
ALTER TABLE "stratum"."Board" DROP CONSTRAINT "Board_ownerUserId_fkey";

-- DropIndex
DROP INDEX "stratum"."board_owner_idx";

-- DropIndex
DROP INDEX "stratum"."board_personal_idx";

-- DropIndex
DROP INDEX "stratum"."team_personal_idx";

-- AlterTable
ALTER TABLE "stratum"."NodeShareInvitation" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "stratum"."Board" ADD CONSTRAINT "Board_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "stratum"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
