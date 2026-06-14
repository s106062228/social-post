-- CreateTable
CREATE TABLE "PostEngagementMilestone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "celebrated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostEngagementMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostEngagementMilestone_postId_metric_threshold_key" ON "PostEngagementMilestone"("postId", "metric", "threshold");

-- CreateIndex
CREATE INDEX "PostEngagementMilestone_userId_idx" ON "PostEngagementMilestone"("userId");

-- CreateIndex
CREATE INDEX "PostEngagementMilestone_userId_achievedAt_idx" ON "PostEngagementMilestone"("userId", "achievedAt" DESC);

-- AddForeignKey
ALTER TABLE "PostEngagementMilestone" ADD CONSTRAINT "PostEngagementMilestone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostEngagementMilestone" ADD CONSTRAINT "PostEngagementMilestone_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
