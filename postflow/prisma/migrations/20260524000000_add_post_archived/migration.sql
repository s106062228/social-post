-- AlterTable
ALTER TABLE "Post" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Post_userId_archivedAt_idx" ON "Post"("userId", "archivedAt");
