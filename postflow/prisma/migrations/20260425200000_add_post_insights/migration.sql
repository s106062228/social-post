-- CreateTable
CREATE TABLE "PostInsights" (
    "id" TEXT NOT NULL,
    "publishResultId" TEXT NOT NULL,
    "impressions" INTEGER,
    "reach" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostInsights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostInsights_publishResultId_key" ON "PostInsights"("publishResultId");

-- CreateIndex
CREATE INDEX "PostInsights_publishResultId_idx" ON "PostInsights"("publishResultId");

-- AddForeignKey
ALTER TABLE "PostInsights" ADD CONSTRAINT "PostInsights_publishResultId_fkey" FOREIGN KEY ("publishResultId") REFERENCES "PublishResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
