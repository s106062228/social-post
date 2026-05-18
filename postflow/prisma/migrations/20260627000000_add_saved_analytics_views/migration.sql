-- CreateTable
CREATE TABLE "SavedAnalyticsView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedAnalyticsView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedAnalyticsView_userId_idx" ON "SavedAnalyticsView"("userId");

-- CreateIndex
CREATE INDEX "SavedAnalyticsView_userId_reportType_idx" ON "SavedAnalyticsView"("userId", "reportType");

-- AddForeignKey
ALTER TABLE "SavedAnalyticsView" ADD CONSTRAINT "SavedAnalyticsView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
