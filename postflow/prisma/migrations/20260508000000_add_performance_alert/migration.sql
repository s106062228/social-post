-- CreateEnum
CREATE TYPE "AlertMetric" AS ENUM ('IMPRESSIONS', 'REACH', 'LIKES', 'COMMENTS', 'SHARES', 'SCORE');

-- CreateEnum
CREATE TYPE "AlertOperator" AS ENUM ('ABOVE', 'BELOW');

-- CreateTable
CREATE TABLE "PerformanceAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metric" "AlertMetric" NOT NULL,
    "operator" "AlertOperator" NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "platform" "Platform",
    "period" TEXT NOT NULL DEFAULT '7d',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PerformanceAlert_userId_idx" ON "PerformanceAlert"("userId");

-- CreateIndex
CREATE INDEX "PerformanceAlert_isActive_idx" ON "PerformanceAlert"("isActive");

-- CreateIndex
CREATE INDEX "PerformanceAlert_userId_createdAt_idx" ON "PerformanceAlert"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "PerformanceAlert" ADD CONSTRAINT "PerformanceAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
