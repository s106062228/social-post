-- AlterTable
ALTER TABLE "Post" ADD COLUMN "assigneeId" TEXT;

-- CreateIndex
CREATE INDEX "Post_assigneeId_idx" ON "Post"("assigneeId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
