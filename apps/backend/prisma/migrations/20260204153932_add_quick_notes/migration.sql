-- CreateEnum
CREATE TYPE "QuickNoteType" AS ENUM ('NOTE', 'DONE', 'WAITING');

-- CreateTable
CREATE TABLE "QuickNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuickNoteType" NOT NULL,
    "kanbanId" TEXT,
    "kanbanName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "treatedAt" TIMESTAMP(3),
    "reminderAt" TIMESTAMP(3),

    CONSTRAINT "QuickNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuickNote_userId_treatedAt_idx" ON "QuickNote"("userId", "treatedAt");

-- CreateIndex
CREATE INDEX "QuickNote_kanbanId_idx" ON "QuickNote"("kanbanId");

-- AddForeignKey
ALTER TABLE "QuickNote" ADD CONSTRAINT "QuickNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickNote" ADD CONSTRAINT "QuickNote_kanbanId_fkey" FOREIGN KEY ("kanbanId") REFERENCES "Board"("id") ON DELETE SET NULL ON UPDATE CASCADE;
