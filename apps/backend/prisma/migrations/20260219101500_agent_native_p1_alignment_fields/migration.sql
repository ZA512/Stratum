-- AN-P1 alignment: backfill migration history for fields already present in schema.prisma

-- Workspace-level scope control for proposals
ALTER TABLE "stratum"."WorkspaceAiConfig"
ADD COLUMN "maxEntitiesPerProposal" INTEGER DEFAULT 50;

-- Proposal explainability payload
ALTER TABLE "stratum"."Proposal"
ADD COLUMN "explanation" JSONB;