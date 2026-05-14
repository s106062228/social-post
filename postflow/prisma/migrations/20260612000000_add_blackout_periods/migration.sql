-- CreateTable
CREATE TABLE "BlackoutPeriod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "daysOfWeek" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlackoutPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlackoutPeriod_userId_idx" ON "BlackoutPeriod"("userId");

-- CreateIndex
CREATE INDEX "BlackoutPeriod_userId_startDate_idx" ON "BlackoutPeriod"("userId", "startDate");

-- CreateIndex
CREATE INDEX "BlackoutPeriod_userId_isRecurring_idx" ON "BlackoutPeriod"("userId", "isRecurring");

-- AddForeignKey
ALTER TABLE "BlackoutPeriod" ADD CONSTRAINT "BlackoutPeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
