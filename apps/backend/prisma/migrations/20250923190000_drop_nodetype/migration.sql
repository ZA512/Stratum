-- Drop constraints or dependencies if any relied on Node.type (none expected)
ALTER TABLE "stratum"."Node" DROP COLUMN IF EXISTS "type";
DROP TYPE IF EXISTS "stratum"."NodeType";
