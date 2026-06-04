-- CreateTable
CREATE TABLE "FollowerMilestone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "milestone" INTEGER NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "celebrated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowerMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FollowerMilestone_accountId_milestone_key" ON "FollowerMilestone"("accountId", "milestone");

-- CreateIndex
CREATE INDEX "FollowerMilestone_userId_idx" ON "FollowerMilestone"("userId");

-- CreateIndex
CREATE INDEX "FollowerMilestone_accountId_idx" ON "FollowerMilestone"("accountId");

-- AddForeignKey
ALTER TABLE "FollowerMilestone" ADD CONSTRAINT "FollowerMilestone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowerMilestone" ADD CONSTRAINT "FollowerMilestone_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
