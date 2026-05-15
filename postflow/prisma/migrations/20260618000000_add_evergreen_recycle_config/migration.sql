-- AlterTable
ALTER TABLE "Post" ADD COLUMN "recycleInterval" INTEGER,
ADD COLUMN "lastRecycledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Post_isEvergreen_lastRecycledAt_idx" ON "Post"("isEvergreen", "lastRecycledAt");
