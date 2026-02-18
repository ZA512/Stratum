-- AN-P1-01: RAG schema complet
-- Tables: RagDocument, RagChunk, RagEmbeddingRecord, RagIndexJob
-- Enums: RagDocumentStatus, RagIndexJobStatus, RagIndexJobReason

-- CreateEnum
CREATE TYPE "stratum"."RagDocumentStatus" AS ENUM ('ACTIVE', 'STALE', 'DELETED');

-- CreateEnum
CREATE TYPE "stratum"."RagIndexJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "stratum"."RagIndexJobReason" AS ENUM ('EVENT', 'REBUILD', 'REPAIR');

-- CreateTable
CREATE TABLE "stratum"."RagDocument" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "sourceVersionHash" TEXT NOT NULL,
    "flattenSchemaVersion" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "status" "stratum"."RagDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RagDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stratum"."RagChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RagChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stratum"."RagEmbeddingRecord" (
    "id" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimension" INTEGER NOT NULL,
    "vectorRef" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RagEmbeddingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stratum"."RagIndexJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reason" "stratum"."RagIndexJobReason" NOT NULL,
    "sourceEventId" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "status" "stratum"."RagIndexJobStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "generationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RagIndexJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (RagDocument)
CREATE UNIQUE INDEX "RagDocument_workspaceId_sourceEntityType_sourceEntityId_sourc_key" ON "stratum"."RagDocument"("workspaceId", "sourceEntityType", "sourceEntityId", "sourceVersionHash");
CREATE INDEX "RagDocument_workspaceId_sourceEntityType_sourceEntityId_idx" ON "stratum"."RagDocument"("workspaceId", "sourceEntityType", "sourceEntityId");
CREATE INDEX "RagDocument_workspaceId_status_idx" ON "stratum"."RagDocument"("workspaceId", "status");

-- CreateIndex (RagChunk)
CREATE UNIQUE INDEX "RagChunk_documentId_chunkIndex_key" ON "stratum"."RagChunk"("documentId", "chunkIndex");
CREATE INDEX "RagChunk_documentId_idx" ON "stratum"."RagChunk"("documentId");

-- CreateIndex (RagEmbeddingRecord)
CREATE UNIQUE INDEX "RagEmbeddingRecord_chunkId_provider_model_key" ON "stratum"."RagEmbeddingRecord"("chunkId", "provider", "model");
CREATE INDEX "RagEmbeddingRecord_chunkId_idx" ON "stratum"."RagEmbeddingRecord"("chunkId");

-- CreateIndex (RagIndexJob)
CREATE INDEX "RagIndexJob_workspaceId_status_createdAt_idx" ON "stratum"."RagIndexJob"("workspaceId", "status", "createdAt" DESC);
CREATE INDEX "RagIndexJob_status_createdAt_idx" ON "stratum"."RagIndexJob"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "stratum"."RagChunk" ADD CONSTRAINT "RagChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "stratum"."RagDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stratum"."RagEmbeddingRecord" ADD CONSTRAINT "RagEmbeddingRecord_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "stratum"."RagChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
