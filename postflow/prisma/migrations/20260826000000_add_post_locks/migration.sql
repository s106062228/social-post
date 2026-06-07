-- CreateTable
CREATE TABLE "PostLock" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostLock_postId_key" ON "PostLock"("postId");

-- CreateIndex
CREATE INDEX "PostLock_userId_idx" ON "PostLock"("userId");

-- CreateIndex
CREATE INDEX "PostLock_expiresAt_idx" ON "PostLock"("expiresAt");

-- AddForeignKey
ALTER TABLE "PostLock" ADD CONSTRAINT "PostLock_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLock" ADD CONSTRAINT "PostLock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
