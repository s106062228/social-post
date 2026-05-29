-- AlterTable: add token health fields to SocialAccount
ALTER TABLE "SocialAccount" ADD COLUMN "tokenHealthCheckedAt" TIMESTAMP(3);
ALTER TABLE "SocialAccount" ADD COLUMN "tokenHealthStatus" TEXT;

-- Index for efficient querying of accounts needing health checks
CREATE INDEX "SocialAccount_tokenHealthStatus_idx" ON "SocialAccount"("tokenHealthStatus");
