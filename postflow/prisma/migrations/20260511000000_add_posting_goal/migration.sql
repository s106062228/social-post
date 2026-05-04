-- CreateEnum
CREATE TYPE "GoalPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "PostingGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetCount" INTEGER NOT NULL,
    "period" "GoalPeriod" NOT NULL,
    "platform" "Platform",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostingGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostingGoal_userId_idx" ON "PostingGoal"("userId");

-- CreateIndex
CREATE INDEX "PostingGoal_userId_isActive_idx" ON "PostingGoal"("userId", "isActive");

-- CreateIndex
CREATE INDEX "PostingGoal_userId_createdAt_idx" ON "PostingGoal"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "PostingGoal" ADD CONSTRAINT "PostingGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
