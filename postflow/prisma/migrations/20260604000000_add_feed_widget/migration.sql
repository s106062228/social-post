-- CreateTable
CREATE TABLE "FeedWidget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountIds" TEXT[],
    "maxPosts" INTEGER NOT NULL DEFAULT 10,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "showPlatformIcons" BOOLEAN NOT NULL DEFAULT true,
    "showTimestamps" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedWidget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedWidget_userId_idx" ON "FeedWidget"("userId");

-- CreateIndex
CREATE INDEX "FeedWidget_userId_createdAt_idx" ON "FeedWidget"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "FeedWidget" ADD CONSTRAINT "FeedWidget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
