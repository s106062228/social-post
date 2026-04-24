-- CreateTable
CREATE TABLE "PostVersion" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "mediaUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostVersion_postId_createdAt_idx" ON "PostVersion"("postId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PostVersion_userId_idx" ON "PostVersion"("userId");

-- AddForeignKey
ALTER TABLE "PostVersion" ADD CONSTRAINT "PostVersion_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
