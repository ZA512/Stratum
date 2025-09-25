-- AlterTable
ALTER TABLE "stratum"."Node" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
