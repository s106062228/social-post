-- CreateEnum
CREATE TYPE "ExternalReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ExternalReview" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewerEmail" TEXT NOT NULL,
    "reviewerName" TEXT,
    "token" TEXT NOT NULL,
    "message" TEXT,
    "status" "ExternalReviewStatus" NOT NULL DEFAULT 'PENDING',
    "feedback" TEXT,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalReview_token_key" ON "ExternalReview"("token");

-- CreateIndex
CREATE INDEX "ExternalReview_postId_idx" ON "ExternalReview"("postId");

-- CreateIndex
CREATE INDEX "ExternalReview_userId_idx" ON "ExternalReview"("userId");

-- CreateIndex
CREATE INDEX "ExternalReview_token_idx" ON "ExternalReview"("token");

-- AddForeignKey
ALTER TABLE "ExternalReview" ADD CONSTRAINT "ExternalReview_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalReview" ADD CONSTRAINT "ExternalReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
