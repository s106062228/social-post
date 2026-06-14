-- AlterTable
ALTER TABLE "Post" ADD COLUMN "isSponsored" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN "sponsorName" TEXT;
ALTER TABLE "Post" ADD COLUMN "disclosureText" TEXT;

-- CreateIndex
CREATE INDEX "Post_userId_isSponsored_idx" ON "Post"("userId", "isSponsored");
