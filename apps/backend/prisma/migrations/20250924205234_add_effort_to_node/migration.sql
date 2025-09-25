-- CreateEnum
CREATE TYPE "stratum"."Effort" AS ENUM ('UNDER2MIN', 'XS', 'S', 'M', 'L', 'XL', 'XXL');

-- AlterTable
ALTER TABLE "stratum"."Node" ADD COLUMN     "effort" "stratum"."Effort";
