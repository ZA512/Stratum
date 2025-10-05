-- CreateTable
CREATE TABLE "stratum"."UserSettings" (
    "userId" TEXT NOT NULL,
    "preferences" JSONB NOT NULL DEFAULT '{}'::JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "stratum"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
