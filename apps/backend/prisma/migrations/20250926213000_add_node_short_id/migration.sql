ALTER TABLE "stratum"."Node" ADD COLUMN "shortId" SERIAL;
ALTER TABLE "stratum"."Node" ADD CONSTRAINT "Node_shortId_key" UNIQUE ("shortId");
