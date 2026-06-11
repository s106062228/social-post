-- CreateTable
CREATE TABLE "DailyBriefing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "todayScheduled" INTEGER NOT NULL DEFAULT 0,
    "weekScheduled" INTEGER NOT NULL DEFAULT 0,
    "yesterdayStats" JSONB NOT NULL,
    "contentGaps" JSONB NOT NULL,
    "topHashtags" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "recommendations" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyBriefing_userId_date_key" ON "DailyBriefing"("userId", "date");

-- CreateIndex
CREATE INDEX "DailyBriefing_userId_idx" ON "DailyBriefing"("userId");

-- CreateIndex
CREATE INDEX "DailyBriefing_userId_date_idx" ON "DailyBriefing"("userId", "date" DESC);

-- AddForeignKey
ALTER TABLE "DailyBriefing" ADD CONSTRAINT "DailyBriefing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
