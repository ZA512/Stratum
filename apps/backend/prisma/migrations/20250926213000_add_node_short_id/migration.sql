ALTER TABLE "Node" ADD COLUMN "shortId" SERIAL;
ALTER TABLE "Node" ADD CONSTRAINT "Node_shortId_key" UNIQUE ("shortId");
