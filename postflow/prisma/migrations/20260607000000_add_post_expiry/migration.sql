-- AlterTable
ALTER TABLE "Post" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Post_expiresAt_idx" ON "Post"("expiresAt");
