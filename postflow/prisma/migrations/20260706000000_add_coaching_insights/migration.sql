-- CreateTable
CREATE TABLE "CoachingInsight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "highlights" TEXT[],
    "improvements" TEXT[],
    "nextWeekFocus" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachingInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachingInsight_userId_idx" ON "CoachingInsight"("userId");

-- CreateIndex
CREATE INDEX "CoachingInsight_userId_weekOf_idx" ON "CoachingInsight"("userId", "weekOf" DESC);

-- AddForeignKey
ALTER TABLE "CoachingInsight" ADD CONSTRAINT "CoachingInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
