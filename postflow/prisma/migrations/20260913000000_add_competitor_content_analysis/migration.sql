-- CreateTable
CREATE TABLE "CompetitorContentAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "competitorName" TEXT NOT NULL,
    "platform" "Platform",
    "content" TEXT NOT NULL,
    "analysis" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorContentAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitorContentAnalysis_userId_idx" ON "CompetitorContentAnalysis"("userId");

-- CreateIndex
CREATE INDEX "CompetitorContentAnalysis_userId_createdAt_idx" ON "CompetitorContentAnalysis"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "CompetitorContentAnalysis" ADD CONSTRAINT "CompetitorContentAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
