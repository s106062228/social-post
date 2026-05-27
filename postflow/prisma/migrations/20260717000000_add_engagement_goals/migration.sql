-- CreateEnum
CREATE TYPE "EngagementMetric" AS ENUM ('IMPRESSIONS', 'REACH', 'LIKES', 'COMMENTS', 'SHARES', 'SCORE');

-- CreateEnum
CREATE TYPE "EngagementAggregation" AS ENUM ('TOTAL', 'AVERAGE');

-- CreateTable
CREATE TABLE "EngagementGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metric" "EngagementMetric" NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "aggregation" "EngagementAggregation" NOT NULL DEFAULT 'AVERAGE',
    "period" "GoalPeriod" NOT NULL,
    "platform" "Platform",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngagementGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EngagementGoal_userId_idx" ON "EngagementGoal"("userId");

-- CreateIndex
CREATE INDEX "EngagementGoal_userId_isActive_idx" ON "EngagementGoal"("userId", "isActive");

-- CreateIndex
CREATE INDEX "EngagementGoal_userId_createdAt_idx" ON "EngagementGoal"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "EngagementGoal" ADD CONSTRAINT "EngagementGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
