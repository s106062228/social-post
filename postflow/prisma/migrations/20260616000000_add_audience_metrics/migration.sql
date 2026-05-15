-- CreateTable
CREATE TABLE "AudienceMetric" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "followersCount" INTEGER,
    "followingCount" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudienceMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AudienceMetric_accountId_syncedAt_idx" ON "AudienceMetric"("accountId", "syncedAt");

-- AddForeignKey
ALTER TABLE "AudienceMetric" ADD CONSTRAINT "AudienceMetric_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
