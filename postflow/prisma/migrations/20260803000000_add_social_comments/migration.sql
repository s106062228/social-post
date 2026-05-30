-- CreateTable
CREATE TABLE "SocialComment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "platformPostId" TEXT NOT NULL,
    "platformCommentId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorHandle" TEXT NOT NULL,
    "authorAvatarUrl" TEXT,
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isReplied" BOOLEAN NOT NULL DEFAULT false,
    "platform" "Platform" NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialComment_platformCommentId_key" ON "SocialComment"("platformCommentId");

-- CreateIndex
CREATE INDEX "SocialComment_userId_idx" ON "SocialComment"("userId");

-- CreateIndex
CREATE INDEX "SocialComment_userId_isRead_idx" ON "SocialComment"("userId", "isRead");

-- CreateIndex
CREATE INDEX "SocialComment_userId_platform_idx" ON "SocialComment"("userId", "platform");

-- CreateIndex
CREATE INDEX "SocialComment_userId_postedAt_idx" ON "SocialComment"("userId", "postedAt");

-- AddForeignKey
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
