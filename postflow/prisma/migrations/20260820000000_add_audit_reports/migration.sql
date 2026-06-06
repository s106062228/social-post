-- CreateTable
CREATE TABLE "AuditReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountHealth" JSONB NOT NULL,
    "contentMix" JSONB NOT NULL,
    "postingPatterns" JSONB NOT NULL,
    "engagementBenchmarks" JSONB NOT NULL,
    "consistencyScore" JSONB NOT NULL,
    "topContent" JSONB NOT NULL,
    "recommendations" TEXT[],
    "overallScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditReport_userId_generatedAt_idx" ON "AuditReport"("userId", "generatedAt" DESC);

-- AddForeignKey
ALTER TABLE "AuditReport" ADD CONSTRAINT "AuditReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
