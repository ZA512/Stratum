-- AlterTable
ALTER TABLE "stratum"."Node" ADD COLUMN     "blockedReason" TEXT,
ADD COLUMN     "blockedSince" TIMESTAMP(3),
ADD COLUMN     "isBlockResolved" BOOLEAN NOT NULL DEFAULT false;
