-- CreateEnum
CREATE TYPE "stratum"."Priority" AS ENUM ('NONE', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST');

-- AlterTable
ALTER TABLE "stratum"."Node" ADD COLUMN     "priority" "stratum"."Priority" NOT NULL DEFAULT 'NONE';
