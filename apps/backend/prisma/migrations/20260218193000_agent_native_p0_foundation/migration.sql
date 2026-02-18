-- CreateEnum
CREATE TYPE "stratum"."WorkspaceAiLevel" AS ENUM ('OFF', 'LIGHT', 'EMBEDDING', 'HEAVY');

-- CreateEnum
CREATE TYPE "stratum"."EventActorType" AS ENUM ('USER', 'AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "stratum"."EventSource" AS ENUM ('API', 'AGENT', 'SCHEDULER');

-- CreateEnum
CREATE TYPE "stratum"."ProposalStatus" AS ENUM ('DRAFT', 'VALIDATED', 'APPROVED', 'REJECTED', 'APPLIED', 'ROLLED_BACK');

-- CreateTable
CREATE TABLE "stratum"."WorkspaceAiConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiLevel" "stratum"."WorkspaceAiLevel" NOT NULL DEFAULT 'OFF',
    "llmProvider" TEXT,
    "llmModel" TEXT,
    "llmBaseUrl" TEXT,
    "embeddingProvider" TEXT,
    "embeddingModel" TEXT,
    "temperature" DECIMAL(3,2),
    "topP" DECIMAL(3,2),
    "maxTokens" INTEGER,
    "systemPromptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceAiConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stratum"."WorkspaceAiQuota" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "monthlyTokenBudget" BIGINT,
    "monthlyEmbeddingBudget" BIGINT,
    "maxRequestsPerMinute" INTEGER NOT NULL DEFAULT 60,
    "hardStopOnBudget" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceAiQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stratum"."AiUsageLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "embeddingTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DECIMAL(12,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stratum"."Proposal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "intent" TEXT,
    "status" "stratum"."ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "confidenceScore" DECIMAL(4,3),
    "determinismScore" TEXT,
    "expectedPreconditions" JSONB,
    "idempotencyKey" TEXT,
    "requestedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "rejectedByUserId" TEXT,
    "rejectionReason" TEXT,
    "alternativesCount" INTEGER NOT NULL DEFAULT 1,
    "selectedAlternativeNo" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stratum"."ProposalAction" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "alternativeNo" INTEGER NOT NULL DEFAULT 1,
    "actionOrder" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetEntityType" TEXT,
    "targetEntityId" TEXT,
    "payload" JSONB NOT NULL,
    "inversePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stratum"."EventLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorType" "stratum"."EventActorType" NOT NULL,
    "actorId" TEXT,
    "source" "stratum"."EventSource" NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "correlationId" TEXT,
    "proposalId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceAiConfig_workspaceId_key" ON "stratum"."WorkspaceAiConfig"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceAiQuota_workspaceId_key" ON "stratum"."WorkspaceAiQuota"("workspaceId");

-- CreateIndex
CREATE INDEX "AiUsageLog_workspaceId_createdAt_idx" ON "stratum"."AiUsageLog"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_workspaceId_idempotencyKey_key" ON "stratum"."Proposal"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Proposal_workspaceId_status_createdAt_idx" ON "stratum"."Proposal"("workspaceId", "status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ProposalAction_proposalId_alternativeNo_actionOrder_key" ON "stratum"."ProposalAction"("proposalId", "alternativeNo", "actionOrder");

-- CreateIndex
CREATE INDEX "ProposalAction_proposalId_idx" ON "stratum"."ProposalAction"("proposalId");

-- CreateIndex
CREATE INDEX "EventLog_workspaceId_createdAt_idx" ON "stratum"."EventLog"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EventLog_proposalId_idx" ON "stratum"."EventLog"("proposalId");

-- CreateIndex
CREATE INDEX "EventLog_entityType_entityId_createdAt_idx" ON "stratum"."EventLog"("entityType", "entityId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "stratum"."ProposalAction" ADD CONSTRAINT "ProposalAction_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "stratum"."Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stratum"."EventLog" ADD CONSTRAINT "EventLog_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "stratum"."Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
