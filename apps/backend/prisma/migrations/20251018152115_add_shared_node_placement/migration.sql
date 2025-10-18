-- CreateTable
CREATE TABLE "stratum"."SharedNodePlacement" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedNodePlacement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SharedNodePlacement_userId_idx" ON "stratum"."SharedNodePlacement"("userId");

-- CreateIndex
CREATE INDEX "SharedNodePlacement_nodeId_idx" ON "stratum"."SharedNodePlacement"("nodeId");

-- CreateIndex
CREATE INDEX "SharedNodePlacement_columnId_idx" ON "stratum"."SharedNodePlacement"("columnId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedNodePlacement_nodeId_userId_key" ON "stratum"."SharedNodePlacement"("nodeId", "userId");

-- AddForeignKey
ALTER TABLE "stratum"."SharedNodePlacement" ADD CONSTRAINT "SharedNodePlacement_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "stratum"."Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stratum"."SharedNodePlacement" ADD CONSTRAINT "SharedNodePlacement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "stratum"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stratum"."SharedNodePlacement" ADD CONSTRAINT "SharedNodePlacement_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "stratum"."Column"("id") ON DELETE CASCADE ON UPDATE CASCADE;
