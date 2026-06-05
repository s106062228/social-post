-- CreateTable
CREATE TABLE "HashtagCampaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "targetPlatforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "goal" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HashtagCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HashtagCampaign_userId_idx" ON "HashtagCampaign"("userId");

-- CreateIndex
CREATE INDEX "HashtagCampaign_userId_isActive_idx" ON "HashtagCampaign"("userId", "isActive");

-- CreateIndex
CREATE INDEX "HashtagCampaign_userId_startDate_idx" ON "HashtagCampaign"("userId", "startDate");

-- AddForeignKey
ALTER TABLE "HashtagCampaign" ADD CONSTRAINT "HashtagCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
