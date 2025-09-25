-- Auth enhancements: add RefreshToken, PasswordResetToken, Invitation tables & enums if not existing.
-- Safe-guard with IF NOT EXISTS to allow re-running in dev resets.

-- Enums InvitationStatus peut ne pas exister encore
DO $$ BEGIN
		CREATE TYPE "stratum"."InvitationStatus" AS ENUM ('PENDING','ACCEPTED','DECLINED','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RefreshToken table
CREATE TABLE IF NOT EXISTS "stratum"."RefreshToken" (
	"id" TEXT NOT NULL,
	"userId" TEXT NOT NULL,
	"tokenHash" TEXT NOT NULL,
	"expiresAt" TIMESTAMP(3) NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"revokedAt" TIMESTAMP(3),
	CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id"),
	CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "stratum"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "stratum"."RefreshToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "stratum"."RefreshToken"("userId");

-- PasswordResetToken table
CREATE TABLE IF NOT EXISTS "stratum"."PasswordResetToken" (
	"id" TEXT NOT NULL,
	"userId" TEXT NOT NULL,
	"tokenHash" TEXT NOT NULL,
	"expiresAt" TIMESTAMP(3) NOT NULL,
	"usedAt" TIMESTAMP(3),
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"),
	CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "stratum"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "stratum"."PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "stratum"."PasswordResetToken"("userId");

-- Invitation table
CREATE TABLE IF NOT EXISTS "stratum"."Invitation" (
	"id" TEXT NOT NULL,
	"email" TEXT NOT NULL,
	"teamId" TEXT NOT NULL,
	"invitedById" TEXT NOT NULL,
	"status" "stratum"."InvitationStatus" NOT NULL DEFAULT 'PENDING',
	"tokenHash" TEXT NOT NULL,
	"expiresAt" TIMESTAMP(3) NOT NULL,
	"respondedAt" TIMESTAMP(3),
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id"),
	CONSTRAINT "Invitation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "stratum"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
	CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "stratum"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Invitation_email_idx" ON "stratum"."Invitation"("email");
CREATE INDEX IF NOT EXISTS "Invitation_teamId_idx" ON "stratum"."Invitation"("teamId");
CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_tokenHash_key" ON "stratum"."Invitation"("tokenHash");

-- Unique index manquant sur Membership (correspond au @@unique du schema)
CREATE UNIQUE INDEX IF NOT EXISTS "Membership_userId_teamId_key" ON "stratum"."Membership"("userId","teamId");

