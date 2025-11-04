-- Node share invitations: introduce dedicated table to persist invitations instead of metadata only.

DO $$ BEGIN
    CREATE TYPE "stratum"."NodeShareInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "stratum"."NodeShareInvitation" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeEmail" TEXT NOT NULL,
    "inviteeUserId" TEXT,
    "status" "stratum"."NodeShareInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NodeShareInvitation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NodeShareInvitation_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "stratum"."Node"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NodeShareInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "stratum"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NodeShareInvitation_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "stratum"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "NodeShareInvitation_nodeId_inviteeEmail_key" ON "stratum"."NodeShareInvitation" ("nodeId", "inviteeEmail");
CREATE INDEX IF NOT EXISTS "NodeShareInvitation_inviteeEmail_idx" ON "stratum"."NodeShareInvitation" ("inviteeEmail");
CREATE INDEX IF NOT EXISTS "NodeShareInvitation_inviteeUserId_idx" ON "stratum"."NodeShareInvitation" ("inviteeUserId");
CREATE INDEX IF NOT EXISTS "NodeShareInvitation_status_idx" ON "stratum"."NodeShareInvitation" ("status");
