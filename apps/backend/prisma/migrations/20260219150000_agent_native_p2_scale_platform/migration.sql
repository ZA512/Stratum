-- AN-P2 — Scale & Platform: migration consolidée
-- Tables: Goal, AiPromptVersion, ProposalFeedback, AgentConversationSession,
--         ConversationSummary, BusinessRuleVersion, BusinessRuleExecutionLog,
--         ProposalExplanation, Webhook, WebhookDelivery, SchedulerJob
-- Enums: NodeKind, GoalHorizon, GoalStatus, AiPromptType, ConversationSessionStatus,
--        BusinessRuleExecResult, BusinessRuleExecSource, WebhookDeliveryStatus, SchedulerJobType
-- Alterations: Node.kind


-- ═══════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════

CREATE TYPE "stratum"."NodeKind" AS ENUM (
  'PROJECT', 'NEXT_ACTION', 'WAITING_FOR', 'NOTE', 'REFERENCE',
  'MILESTONE', 'DECISION', 'RISK', 'BLOCKER'
);

CREATE TYPE "stratum"."GoalHorizon" AS ENUM ('WEEK', 'QUARTER', 'YEAR');
CREATE TYPE "stratum"."GoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DONE', 'ARCHIVED');
CREATE TYPE "stratum"."AiPromptType" AS ENUM ('PROPOSAL', 'BRIEF', 'REFACTOR', 'CHAT_SUMMARY');
CREATE TYPE "stratum"."ConversationSessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'RESET');
CREATE TYPE "stratum"."BusinessRuleExecResult" AS ENUM ('PASS', 'FAIL', 'ERROR');
CREATE TYPE "stratum"."BusinessRuleExecSource" AS ENUM ('MANUAL_API', 'PROPOSAL_APPLY', 'AGENT_PRECHECK', 'SCHEDULER');
CREATE TYPE "stratum"."WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'DEAD_LETTER');
CREATE TYPE "stratum"."SchedulerJobType" AS ENUM ('MORNING_BRIEF', 'WEEKLY_REPORT', 'STAGNATION_CHECK', 'WIP_OVERLOAD_CHECK');


-- ═══════════════════════════════════════════════════
-- ALTER TABLE: Node.kind
-- ═══════════════════════════════════════════════════

ALTER TABLE "stratum"."Node"
  ADD COLUMN "kind" "stratum"."NodeKind" NOT NULL DEFAULT 'NEXT_ACTION';

CREATE INDEX "Node_workspaceId_kind_archivedAt_idx"
  ON "stratum"."Node"("workspaceId", "kind", "archivedAt");


-- ═══════════════════════════════════════════════════
-- TABLE: Goal (AN-P2-06)
-- ═══════════════════════════════════════════════════

CREATE TABLE "stratum"."Goal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "horizon" "stratum"."GoalHorizon" NOT NULL,
    "linkedNodes" JSONB NOT NULL DEFAULT '[]',
    "successMetric" JSONB NOT NULL DEFAULT '{}',
    "confidenceLevel" DECIMAL(4,3),
    "status" "stratum"."GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Goal_workspaceId_status_horizon_idx"
  ON "stratum"."Goal"("workspaceId", "status", "horizon");


-- ═══════════════════════════════════════════════════
-- TABLE: AiPromptVersion (dette technique)
-- ═══════════════════════════════════════════════════

CREATE TABLE "stratum"."AiPromptVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "promptType" "stratum"."AiPromptType" NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "variablesSchema" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "AiPromptVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiPromptVersion_workspaceId_promptType_version_key"
  ON "stratum"."AiPromptVersion"("workspaceId", "promptType", "version");
CREATE INDEX "AiPromptVersion_workspaceId_promptType_isActive_idx"
  ON "stratum"."AiPromptVersion"("workspaceId", "promptType", "isActive");


-- ═══════════════════════════════════════════════════
-- TABLE: ProposalFeedback (dette technique)
-- ═══════════════════════════════════════════════════

CREATE TABLE "stratum"."ProposalFeedback" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "modifiedAfterApply" BOOLEAN NOT NULL DEFAULT false,
    "userRating" INTEGER,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProposalFeedback_proposalId_userId_key"
  ON "stratum"."ProposalFeedback"("proposalId", "userId");
CREATE INDEX "ProposalFeedback_workspaceId_createdAt_idx"
  ON "stratum"."ProposalFeedback"("workspaceId", "createdAt" DESC);

ALTER TABLE "stratum"."ProposalFeedback"
  ADD CONSTRAINT "ProposalFeedback_proposalId_fkey"
    FOREIGN KEY ("proposalId") REFERENCES "stratum"."Proposal"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════
-- TABLE: AgentConversationSession (dette technique)
-- ═══════════════════════════════════════════════════

CREATE TABLE "stratum"."AgentConversationSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boardId" TEXT,
    "focusNodeId" TEXT,
    "status" "stratum"."ConversationSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "tokenBudget" INTEGER NOT NULL DEFAULT 12000,
    "autoSummarizeThreshold" INTEGER NOT NULL DEFAULT 8000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConversationSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentConversationSession_workspaceId_userId_updatedAt_idx"
  ON "stratum"."AgentConversationSession"("workspaceId", "userId", "updatedAt" DESC);


-- ═══════════════════════════════════════════════════
-- TABLE: ConversationSummary (dette technique)
-- ═══════════════════════════════════════════════════

CREATE TABLE "stratum"."ConversationSummary" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "summaryVersion" INTEGER NOT NULL,
    "summaryText" TEXT NOT NULL,
    "coveredMessageCount" INTEGER NOT NULL,
    "promptVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationSummary_sessionId_summaryVersion_key"
  ON "stratum"."ConversationSummary"("sessionId", "summaryVersion");

ALTER TABLE "stratum"."ConversationSummary"
  ADD CONSTRAINT "ConversationSummary_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "stratum"."AgentConversationSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════
-- TABLE: BusinessRuleVersion (dette technique)
-- ═══════════════════════════════════════════════════

CREATE TABLE "stratum"."BusinessRuleVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ruleSetName" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rulesJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "BusinessRuleVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessRuleVersion_workspaceId_ruleSetName_version_key"
  ON "stratum"."BusinessRuleVersion"("workspaceId", "ruleSetName", "version");
CREATE INDEX "BusinessRuleVersion_workspaceId_ruleSetName_isActive_idx"
  ON "stratum"."BusinessRuleVersion"("workspaceId", "ruleSetName", "isActive");


-- ═══════════════════════════════════════════════════
-- TABLE: BusinessRuleExecutionLog (dette technique)
-- ═══════════════════════════════════════════════════

CREATE TABLE "stratum"."BusinessRuleExecutionLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "source" "stratum"."BusinessRuleExecSource" NOT NULL,
    "correlationId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "actionType" TEXT,
    "result" "stratum"."BusinessRuleExecResult" NOT NULL,
    "violations" JSONB,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessRuleExecutionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BusinessRuleExecutionLog_workspaceId_createdAt_idx"
  ON "stratum"."BusinessRuleExecutionLog"("workspaceId", "createdAt" DESC);
CREATE INDEX "BusinessRuleExecutionLog_correlationId_idx"
  ON "stratum"."BusinessRuleExecutionLog"("correlationId");

ALTER TABLE "stratum"."BusinessRuleExecutionLog"
  ADD CONSTRAINT "BusinessRuleExecutionLog_ruleVersionId_fkey"
    FOREIGN KEY ("ruleVersionId") REFERENCES "stratum"."BusinessRuleVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════
-- TABLE: ProposalExplanation (dette technique)
-- ═══════════════════════════════════════════════════

CREATE TABLE "stratum"."ProposalExplanation" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "reasoningSummary" TEXT NOT NULL,
    "referencedEntities" JSONB NOT NULL DEFAULT '[]',
    "ragDocIdsUsed" JSONB NOT NULL DEFAULT '[]',
    "confidenceScore" DECIMAL(4,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalExplanation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProposalExplanation_proposalId_key"
  ON "stratum"."ProposalExplanation"("proposalId");
CREATE INDEX "ProposalExplanation_proposalId_idx"
  ON "stratum"."ProposalExplanation"("proposalId");

ALTER TABLE "stratum"."ProposalExplanation"
  ADD CONSTRAINT "ProposalExplanation_proposalId_fkey"
    FOREIGN KEY ("proposalId") REFERENCES "stratum"."Proposal"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════
-- TABLE: Webhook (AN-P2-04 persisté)
-- ═══════════════════════════════════════════════════

CREATE TABLE "stratum"."Webhook" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "eventTypes" TEXT[] NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Webhook_workspaceId_enabled_idx"
  ON "stratum"."Webhook"("workspaceId", "enabled");


-- ═══════════════════════════════════════════════════
-- TABLE: WebhookDelivery (AN-P2-04 persisté)
-- ═══════════════════════════════════════════════════

CREATE TABLE "stratum"."WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "stratum"."WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "httpStatus" INTEGER,
    "errorMessage" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "nextRetryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookDelivery_webhookId_createdAt_idx"
  ON "stratum"."WebhookDelivery"("webhookId", "createdAt" DESC);
CREATE INDEX "WebhookDelivery_status_nextRetryAt_idx"
  ON "stratum"."WebhookDelivery"("status", "nextRetryAt");

ALTER TABLE "stratum"."WebhookDelivery"
  ADD CONSTRAINT "WebhookDelivery_webhookId_fkey"
    FOREIGN KEY ("webhookId") REFERENCES "stratum"."Webhook"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════
-- TABLE: SchedulerJob (AN-P2-05 persisté)
-- ═══════════════════════════════════════════════════

CREATE TABLE "stratum"."SchedulerJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jobType" "stratum"."SchedulerJobType" NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulerJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchedulerJob_workspaceId_jobType_key"
  ON "stratum"."SchedulerJob"("workspaceId", "jobType");
CREATE INDEX "SchedulerJob_enabled_nextRunAt_idx"
  ON "stratum"."SchedulerJob"("enabled", "nextRunAt");
