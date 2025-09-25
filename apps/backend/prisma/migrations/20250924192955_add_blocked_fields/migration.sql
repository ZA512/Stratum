-- AlterTable
ALTER TABLE "stratum"."Node" ADD COLUMN     "blockedExpectedUnblockAt" TIMESTAMP(3),
ADD COLUMN     "blockedReminderEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "blockedReminderIntervalDays" INTEGER;
