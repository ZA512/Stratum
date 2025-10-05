-- CreateTable
CREATE TABLE "stratum"."BoardDailySnapshot" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "dateUTC" TIMESTAMP(3) NOT NULL,
    "backlog" INTEGER NOT NULL DEFAULT 0,
    "inProgress" INTEGER NOT NULL DEFAULT 0,
    "blocked" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardDailySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoardDailySnapshot_boardId_dateUTC_key" ON "stratum"."BoardDailySnapshot"("boardId", "dateUTC");
CREATE INDEX "BoardDailySnapshot_dateUTC_idx" ON "stratum"."BoardDailySnapshot"("dateUTC");

-- AddForeignKey
ALTER TABLE "stratum"."BoardDailySnapshot" ADD CONSTRAINT "BoardDailySnapshot_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "stratum"."Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
