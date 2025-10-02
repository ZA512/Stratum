-- AlterTable
ALTER TABLE "stratum"."Comment" ADD COLUMN     "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "notifyAccountable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyConsulted" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyInformed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyProject" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyResponsible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifySubProject" BOOLEAN NOT NULL DEFAULT false;
