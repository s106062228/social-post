-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PostPromotion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT,
    "platform" "Platform" NOT NULL,
    "campaignName" TEXT NOT NULL,
    "budget" DOUBLE PRECISION NOT NULL,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "goal" TEXT,
    "status" "PromotionStatus" NOT NULL DEFAULT 'PLANNED',
    "impressions" INTEGER,
    "clicks" INTEGER,
    "conversions" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostPromotion_userId_idx" ON "PostPromotion"("userId");

-- CreateIndex
CREATE INDEX "PostPromotion_userId_status_idx" ON "PostPromotion"("userId", "status");

-- CreateIndex
CREATE INDEX "PostPromotion_userId_createdAt_idx" ON "PostPromotion"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PostPromotion_postId_idx" ON "PostPromotion"("postId");

-- AddForeignKey
ALTER TABLE "PostPromotion" ADD CONSTRAINT "PostPromotion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPromotion" ADD CONSTRAINT "PostPromotion_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
